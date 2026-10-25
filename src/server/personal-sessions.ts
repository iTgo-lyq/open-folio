import { validBranchName } from "../lib/collaboration.ts";
import "server-only";
import {
  accountInput,
  hashPassword,
  verifyPassword,
  withPasswordGate,
} from "./account-passwords.ts";
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
const repositoryPreference = z.object({
  providerId: z.string().min(1).max(80),
  instanceId: z.string().min(1).max(255),
  repositoryId: z.string().min(1).max(100),
  fullName: z.string().min(1).max(255),
});
// Keep the persisted preference shape alongside existing encrypted credentials.
const storedPreferencesSchema = z
  .object({
    repository: repositoryPreference
      .extend({
        collaborationBranch: z.string().refine(validBranchName).optional(),
      })
      .strict()
      .nullable()
      .optional(),
    module: z.enum(["specs", "changes", "prototypes"]).optional(),
    railCollapsed: z.boolean().optional(),
  })
  .strict();
export const preferencesSchema = storedPreferencesSchema.extend({
  repository: repositoryPreference
    .extend({
      integrationBranch: z.string().refine(validBranchName).optional(),
    })
    .strict()
    .nullable()
    .optional(),
});
function publicPreferences(
  p: z.infer<typeof storedPreferencesSchema>,
): WorkspacePreferences {
  if (!p.repository) return p as WorkspacePreferences;
  const { collaborationBranch, ...repository } = p.repository;
  return {
    ...p,
    repository: {
      ...repository,
      ...(collaborationBranch
        ? { integrationBranch: collaborationBranch }
        : {}),
    },
  };
}
export const workspaceSchema = z
  .object({
    id: z.string().uuid(),
    accountId: z.string().uuid(),
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
    preferences: storedPreferencesSchema,
    createdAt: z.number().int().positive(),
  })
  .strict();
export const accountSchema = z
  .object({
    id: z.string().uuid(),
    username: z.string().min(1).max(128),
    usernameKey: z.string().min(1).max(1024),
    passwordSalt: z.string().regex(/^[a-f0-9]{32}$/),
    passwordHash: z.string().regex(/^[a-f0-9]{128}$/),
    createdAt: z.number().int().positive(),
  })
  .strict();
export const deviceSchema = z
  .object({
    id: z.string().uuid(),
    accountId: z.string().uuid(),
    cookieHash: z.string().regex(/^[a-f0-9]{64}$/),
    workspaceId: z.string().uuid().nullable(),
    revision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    selectionRevision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    createdAt: z.number().int().positive(),
    lastSeenAt: z.number().int().positive(),
    expiresAt: z.number().int().positive(),
    absoluteExpiresAt: z.number().int().positive(),
    displayLabel: z.string().min(1).max(100),
  })
  .strict();
export const workspaceStateSchema = z
  .object({
    schemaVersion: z.literal(1),
    accounts: z.array(accountSchema).max(10000),
    workspaces: z.array(workspaceSchema).max(10000),
    sessions: z.array(deviceSchema).max(10000),
  })
  .strict();
export type Account = z.infer<typeof accountSchema>;
export type Workspace = z.infer<typeof workspaceSchema>;
export type DeviceSession = z.infer<typeof deviceSchema>;
export type WorkspaceState = z.infer<typeof workspaceStateSchema>;
export type WorkspacePreferences = z.infer<typeof preferencesSchema>;
export type WorkspaceSummary = Pick<
  Workspace,
  "id" | "identity" | "label" | "gitUsername"
> & { preferences: WorkspacePreferences };
export type ConnectionSummary = Pick<
  WorkspaceSummary,
  "id" | "identity" | "label"
> & { revision: number };
export interface SessionSummary {
  authenticated: boolean;
  connected: boolean;
  account?: { id: string; username: string };
  deviceSessionId?: string;
  expiresAt?: number;
  absoluteExpiresAt?: number;
  workspace?: WorkspaceSummary;
  connections: ConnectionSummary[];
  browserRevision?: number;
  selectionRevision?: number;
  renewed?: boolean;
}
export interface WorkspaceLease {
  accountId: string;
  workspaceId: string;
  connection: ConnectionSummary;
  context: ProviderContext;
  assertCurrent(): Promise<void>;
  release(): void;
}
export interface ConnectionLease extends WorkspaceLease {
  sessionId: string;
  deviceSessionId: string;
}
export const sessionIdleTtl = 30 * 24 * 60 * 60 * 1000;
export const sessionAbsoluteTtl = 90 * 24 * 60 * 60 * 1000;
const touchInterval = 24 * 60 * 60 * 1000;
export const cookieHash = (s: string) =>
  createHash("sha256").update(s).digest("hex");
const denied = () => new AppError("SESSION_REQUIRED", "请先登录账号。", 401);
const workspaceSummary = (w: Workspace): WorkspaceSummary => ({
  id: w.id,
  identity: w.identity,
  label: w.label,
  gitUsername: w.gitUsername,
  preferences: publicPreferences(w.preferences),
});
export const connectionSummary = (w: Workspace): ConnectionSummary => ({
  id: w.id,
  revision: 1,
  identity: w.identity,
  label: w.label,
});
const summary = (
  state: WorkspaceState,
  s?: DeviceSession,
  renewed = false,
): SessionSummary => {
  if (!s) return { authenticated: false, connected: false, connections: [] };
  const a = state.accounts.find((a) => a.id === s.accountId)!,
    w = state.workspaces.find(
      (w) => w.id === s.workspaceId && w.accountId === a.id,
    );
  return {
    authenticated: true,
    connected: !!w,
    account: { id: a.id, username: a.username },
    deviceSessionId: s.id,
    expiresAt: s.expiresAt,
    absoluteExpiresAt: s.absoluteExpiresAt,
    connections: state.workspaces
      .filter((w) => w.accountId === a.id)
      .map(connectionSummary),
    browserRevision: s.revision,
    selectionRevision: s.selectionRevision,
    ...(w ? { workspace: workspaceSummary(w) } : {}),
    ...(renewed ? { renewed: true } : {}),
  };
};
const emptyState = (): WorkspaceState => ({
  schemaVersion: 1,
  accounts: [],
  workspaces: [],
  sessions: [],
});
export function parseWorkspaceState(input: unknown): WorkspaceState {
  const state = workspaceStateSchema.parse(input),
    accounts = new Map(state.accounts.map((a) => [a.id, a])),
    workspaces = new Map(state.workspaces.map((w) => [w.id, w]));
  if (
    accounts.size !== state.accounts.length ||
    workspaces.size !== state.workspaces.length ||
    new Set(state.accounts.map((a) => a.usernameKey)).size !==
      state.accounts.length ||
    new Set(state.workspaces.map((w) => w.credentialFingerprint)).size !==
      state.workspaces.length ||
    new Set(state.sessions.map((s) => s.id)).size !== state.sessions.length ||
    new Set(state.sessions.map((s) => s.cookieHash)).size !==
      state.sessions.length ||
    state.accounts.some((a) => {
      try {
        return (
          accountInput(a.username, "12345678").usernameKey !== a.usernameKey
        );
      } catch {
        return true;
      }
    }) ||
    state.workspaces.some(
      (w) =>
        !accounts.has(w.accountId) ||
        w.identity.providerId !== w.providerId ||
        w.identity.instanceId !== w.instanceId,
    ) ||
    state.sessions.some(
      (s) =>
        !accounts.has(s.accountId) ||
        (s.workspaceId !== null &&
          workspaces.get(s.workspaceId)?.accountId !== s.accountId) ||
        s.lastSeenAt < s.createdAt ||
        s.expiresAt > s.absoluteExpiresAt ||
        s.absoluteExpiresAt < s.createdAt,
    ) ||
    state.accounts.some(
      (a) =>
        state.workspaces.filter((w) => w.accountId === a.id).length > 32 ||
        state.sessions.filter((s) => s.accountId === a.id).length > 32,
    )
  )
    throw Error("Invalid account relationships");
  return state;
}
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
  accountId: string,
  providerId: string,
  instanceId: string,
  secret: SecretHandle,
) {
  return secret.use((token) =>
    createHmac("sha256", key)
      .update(JSON.stringify([accountId, providerId, instanceId, token]))
      .digest("hex"),
  );
}
const aad = (
  w: Pick<Workspace, "id" | "accountId" | "providerId" | "instanceId">,
) =>
  Buffer.from(
    JSON.stringify([1, w.accountId, w.id, w.providerId, w.instanceId]),
  );
export function encryptWorkspace(
  w: Pick<Workspace, "id" | "accountId" | "providerId" | "instanceId">,
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
        return emptyState();
      }
      const state = parseWorkspaceState(JSON.parse(raw));
      await this.keys(false);
      return state;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return emptyState();
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
      JSON.stringify(parseWorkspaceState(state)),
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
    if (!expired.length) return;
    state.sessions = state.sessions.filter((s) => !expired.includes(s));
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
  private require(state: WorkspaceState, cookie: string, expected?: number) {
    const s = this.find(state, cookie);
    if (!s) throw denied();
    this.checkRevision(s, expected);
    return s;
  }
  private checkRevision(s: DeviceSession | undefined, expected?: number) {
    if (expected !== undefined && s && s.revision !== expected)
      throw new AppError(
        "SESSION_CHANGED",
        "账号或 Token 列表已改变，请重试。",
        409,
      );
  }
  private owned(state: WorkspaceState, s: DeviceSession, id: string) {
    const w = state.workspaces.find(
      (w) => w.id === id && w.accountId === s.accountId,
    );
    if (!w)
      throw new AppError("CONNECTION_NOT_FOUND", "Token 绑定不存在。", 404);
    return w;
  }
  private bump(state: WorkspaceState, accountId: string) {
    for (const s of state.sessions) if (s.accountId === accountId) s.revision++;
  }
  private select(s: DeviceSession, w: Workspace) {
    s.workspaceId = w.id;
    s.selectionRevision++;
    this.stopDevice(s);
  }
  async get(cookie: string): Promise<SessionSummary> {
    return this.lock(async () => {
      const state = await this.load();
      await this.prune(state);
      const s = this.find(state, cookie);
      let renewed = false;
      if (s && this.now() - s.lastSeenAt >= touchInterval) {
        s.lastSeenAt = this.now();
        s.expiresAt = Math.min(
          this.now() + sessionIdleTtl,
          s.absoluteExpiresAt,
        );
        await this.save(state);
        renewed = true;
      }
      return summary(state, s, renewed);
    });
  }
  private async authenticate(
    cookie: string,
    username: string,
    password: string,
    register: boolean,
    signal: AbortSignal,
    displayLabel: string,
    expectedRevision?: number,
  ) {
    const name = accountInput(username, password);
    return withPasswordGate(
      `${this.root}/${name.usernameKey}`,
      this.now,
      async () => {
        const initial = await this.lock(async () => {
          const state = await this.load();
          await this.prune(state);
          const s = this.find(state, cookie);
          this.checkRevision(s, expectedRevision);
          return {
            account: state.accounts.find(
              (a) => a.usernameKey === name.usernameKey,
            ),
            sessionId: s?.id,
            revision: s?.revision,
          };
        });
        const passwordData = register
          ? await hashPassword(password)
          : undefined;
        if (!register && !(await verifyPassword(password, initial.account)))
          throw new AppError("INVALID_CREDENTIALS", "账号或密码错误。", 401);
        return this.lock(async () => {
          signal.throwIfAborted();
          const state = await this.load();
          await this.prune(state);
          const old = this.find(state, cookie);
          if (
            old?.id !== initial.sessionId ||
            old?.revision !== initial.revision
          )
            throw new AppError(
              "SESSION_CHANGED",
              "登录状态已改变，请重试。",
              409,
            );
          let account = state.accounts.find(
            (a) => a.usernameKey === name.usernameKey,
          );
          if (register) {
            if (account)
              throw new AppError("ACCOUNT_EXISTS", "账号已存在。", 409);
            if (state.accounts.length >= 10000)
              throw new AppError("ACCOUNT_LIMIT", "账号数量达到上限。", 409);
            account = {
              id: randomUUID(),
              ...name,
              ...passwordData!,
              createdAt: this.now(),
            };
            state.accounts.push(account);
          } else if (!account || account.id !== initial.account?.id)
            throw denied();
          if (
            state.sessions.filter(
              (s) => s !== old && s.accountId === account.id,
            ).length >= 32 ||
            state.sessions.length - (old ? 1 : 0) >= 10000
          )
            throw new AppError(
              "SESSION_LIMIT",
              "设备数量达到上限，请先退出不用的设备。",
              409,
            );
          await this.keys(!(await this.stateExists()));
          const token = randomBytes(32).toString("base64url"),
            now = this.now();
          const s: DeviceSession = {
            id: randomUUID(),
            accountId: account.id,
            cookieHash: cookieHash(token),
            workspaceId: null,
            revision: 1,
            selectionRevision: 1,
            createdAt: now,
            lastSeenAt: now,
            expiresAt: now + sessionIdleTtl,
            absoluteExpiresAt: now + sessionAbsoluteTtl,
            displayLabel: displayLabel.slice(0, 100) || "浏览器",
          };
          state.sessions = state.sessions.filter((s) => s !== old);
          state.sessions.push(s);
          await this.save(state);
          if (old) this.stopDevice(old);
          return {
            cookie: token,
            cookieExpiresAt: s.absoluteExpiresAt,
            session: summary(state, s),
          };
        });
      },
    );
  }
  private async stateExists() {
    try {
      await lstat(join(this.root, "state.json"));
      return true;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return false;
      throw e;
    }
  }
  register(
    cookie: string,
    username: string,
    password: string,
    signal: AbortSignal,
    displayLabel = "浏览器",
    expectedRevision?: number,
  ) {
    return this.authenticate(
      cookie,
      username,
      password,
      true,
      signal,
      displayLabel,
      expectedRevision,
    );
  }
  login(
    cookie: string,
    username: string,
    password: string,
    signal: AbortSignal,
    displayLabel = "浏览器",
    expectedRevision?: number,
  ) {
    return this.authenticate(
      cookie,
      username,
      password,
      false,
      signal,
      displayLabel,
      expectedRevision,
    );
  }
  async bind(
    cookie: string,
    providerId: string,
    input: string,
    label: string | undefined,
    signal: AbortSignal,
    expectedRevision?: number,
  ) {
    if (!input || input.length > 4096 || /[\x00-\x1f\x7f]/.test(input))
      throw new AppError("INVALID_TOKEN", "请填写有效 Token。", 400);
    const name = this.label(label),
      secret = new SecretHandle(input),
      provider = this.registry.get(providerId);
    const initial = await this.lock(async () => {
      const state = await this.load();
      await this.prune(state);
      const session = this.require(state, cookie, expectedRevision);
      const fingerprint = credentialFingerprint(
        (await this.keys(false)).identity,
        session.accountId,
        providerId,
        provider.describeConnection().instance,
        secret,
      );
      const existing = state.workspaces.find(
        (w) =>
          w.accountId === session.accountId &&
          w.credentialFingerprint === fingerprint,
      );
      return { ...session, knownIdentity: existing?.identity };
    });
    const authenticated = await provider.authenticate(
      secret,
      signal,
      initial.knownIdentity,
    );
    const { gitUsername, ...identity } = this.providerIdentity(
      authenticated,
      providerId,
      provider.describeConnection().instance,
    );
    return this.lock(async () => {
      signal.throwIfAborted();
      const state = await this.load();
      await this.prune(state);
      const s = this.require(state, cookie, initial.revision);
      if (s.id !== initial.id || s.accountId !== initial.accountId)
        throw denied();
      const keys = await this.keys(false),
        fingerprint = credentialFingerprint(
          keys.identity,
          s.accountId,
          providerId,
          identity.instanceId,
          secret,
        );
      let w = state.workspaces.find(
        (w) =>
          w.accountId === s.accountId &&
          w.credentialFingerprint === fingerprint,
      );
      let changed = !w;
      if (!w) {
        if (
          state.workspaces.length >= 10000 ||
          state.workspaces.filter((w) => w.accountId === s.accountId).length >=
            32
        )
          throw new AppError("WORKSPACE_LIMIT", "Token 数量达到上限。", 409);
        const base = {
          id: randomUUID(),
          accountId: s.accountId,
          providerId,
          instanceId: identity.instanceId,
        };
        w = {
          ...base,
          credentialFingerprint: fingerprint,
          identity,
          gitUsername,
          label: name ?? identity.login,
          preferences: {},
          createdAt: this.now(),
          ...encryptWorkspace(base, secret, keys.credential),
        };
        state.workspaces.push(w);
      } else {
        decryptWorkspace(w, keys.credential);
        changed =
          JSON.stringify(w.identity) !== JSON.stringify(identity) ||
          w.gitUsername !== gitUsername ||
          (name !== undefined && w.label !== name);
        w.identity = identity;
        w.gitUsername = gitUsername;
        if (name) w.label = name;
      }
      if (changed) this.bump(state, s.accountId);
      else s.revision++;
      this.select(s, w);
      await this.save(state);
      return { session: summary(state, s), connection: connectionSummary(w) };
    });
  }
  private label(value: string | undefined) {
    if (value === undefined) return undefined;
    const name = value.trim();
    if (!name || name.length > 100 || /\p{Cc}/u.test(name))
      throw new AppError("INVALID_PARAMETER", "名称为 1–100 个字符。", 400);
    return name;
  }
  private providerIdentity(
    value: unknown,
    providerId: string,
    instanceId: string,
  ) {
    const parsed = identitySchema.passthrough().parse(value),
      gitUsername =
        (value as { gitUsername?: string }).gitUsername ?? parsed.login;
    const identity = identitySchema.parse({
      providerId: parsed.providerId,
      instanceId: parsed.instanceId,
      subjectId: parsed.subjectId,
      login: parsed.login,
      displayName: parsed.displayName,
    });
    if (
      identity.providerId !== providerId ||
      identity.instanceId !== instanceId
    )
      throw new AppError("PROVIDER_MISMATCH", "身份与所选平台不匹配。", 400);
    if (!workspaceSchema.shape.gitUsername.safeParse(gitUsername).success)
      throw new AppError("INVALID_USERNAME", "平台未返回有效的用户名。", 502);
    return { ...identity, gitUsername };
  }
  async switchConnection(
    cookie: string,
    id: string,
    signal: AbortSignal,
    expectedRevision?: number,
  ) {
    const initial = await this.lock(async () => {
      const state = await this.load();
      await this.prune(state);
      const s = this.require(state, cookie, expectedRevision),
        w = this.owned(state, s, id);
      return {
        s,
        w,
        secret: decryptWorkspace(w, (await this.keys(false)).credential),
      };
    });
    const provider = this.registry.get(initial.w.providerId),
      authenticated = await provider.authenticate(
        initial.secret,
        signal,
        initial.w.identity,
      );
    const { gitUsername, ...identity } = this.providerIdentity(
      authenticated,
      initial.w.providerId,
      initial.w.instanceId,
    );
    if (identity.subjectId !== initial.w.identity.subjectId)
      throw new AppError(
        "IDENTITY_CHANGED",
        "平台身份已改变，请重新绑定 Token。",
        401,
      );
    return this.lock(async () => {
      signal.throwIfAborted();
      const state = await this.load();
      await this.prune(state);
      const s = this.require(state, cookie, initial.s.revision),
        w = this.owned(state, s, id);
      if (
        s.id !== initial.s.id ||
        w.credentialFingerprint !== initial.w.credentialFingerprint
      )
        throw denied();
      w.identity = identity;
      w.gitUsername = gitUsername;
      s.revision++;
      this.select(s, w);
      await this.save(state);
      return { session: summary(state, s), connection: connectionSummary(w) };
    });
  }
  async renameConnection(
    cookie: string,
    id: string,
    label: string,
    expectedRevision?: number,
  ) {
    const name = this.label(label)!;
    return this.lock(async () => {
      const state = await this.load();
      await this.prune(state);
      const s = this.require(state, cookie, expectedRevision),
        w = this.owned(state, s, id);
      w.label = name;
      this.bump(state, s.accountId);
      await this.save(state);
      return summary(state, s);
    });
  }
  async unbind(cookie: string, id: string, expectedRevision?: number) {
    return this.lock(async () => {
      const state = await this.load();
      await this.prune(state);
      const s = this.require(state, cookie, expectedRevision),
        w = this.owned(state, s, id);
      state.workspaces = state.workspaces.filter((x) => x !== w);
      this.bump(state, s.accountId);
      const affected = state.sessions.filter(
        (x) => x.accountId === s.accountId && x.workspaceId === id,
      );
      for (const x of affected) {
        x.workspaceId = null;
        x.selectionRevision++;
      }
      await this.save(state);
      affected.forEach((x) => this.stopDevice(x));
      this.stopWorkspace(id);
      return summary(state, s);
    });
  }
  async remove(
    cookie: string,
    id?: string,
    all = false,
    expectedRevision?: number,
  ) {
    return this.lock(async () => {
      const state = await this.load();
      await this.prune(state);
      const s = this.require(state, cookie, expectedRevision);
      if (id && id !== s.workspaceId) throw denied();
      const removed = state.sessions.filter((x) =>
        all ? x.accountId === s.accountId : x.id === s.id,
      );
      state.sessions = state.sessions.filter((x) => !removed.includes(x));
      await this.save(state);
      removed.forEach((x) => this.stopDevice(x));
      if (all)
        for (const w of state.workspaces)
          if (w.accountId === s.accountId) this.stopWorkspace(w.id);
      return summary(state);
    });
  }
  async lease(
    cookie: string,
    id: string | undefined,
    signal?: AbortSignal,
    workspaceOwned = false,
    expectedRevision?: number,
  ): Promise<ConnectionLease> {
    return this.lock(async () => {
      const state = await this.load();
      await this.prune(state);
      const s = this.require(state, cookie, expectedRevision);
      const w = state.workspaces.find(
        (w) => w.id === s.workspaceId && w.accountId === s.accountId,
      );
      if (!w || (id && id !== w.id)) throw denied();
      const lease = await this.bindingLease(
        w,
        signal,
        workspaceOwned ? undefined : { cookie, session: s },
      );
      return { ...lease, sessionId: s.id, deviceSessionId: s.id };
    });
  }
  workspaceLease(cookie: string, id: string) {
    return this.lease(cookie, id, undefined, true);
  }
  // Server-only source identities; no credentials or device sessions leave here.
  async repositoryBindings() {
    const state = await this.load();
    return state.workspaces.map(
      ({ id, accountId, providerId, instanceId }) => ({
        workspaceId: id,
        accountId,
        providerId,
        instanceId,
      }),
    );
  }
  // Internal credential ownership, used only after server-side scope authorization.
  async credentialLease(
    accountId: string,
    workspaceId: string,
    signal?: AbortSignal,
  ): Promise<WorkspaceLease> {
    return this.lock(async () => {
      const state = await this.load();
      const workspace = state.workspaces.find(
        (w) => w.id === workspaceId && w.accountId === accountId,
      );
      if (!workspace || !state.accounts.some((a) => a.id === accountId))
        throw denied();
      return this.bindingLease(workspace, signal);
    });
  }
  private async bindingLease(
    w: Workspace,
    signal?: AbortSignal,
    device?: { cookie: string; session: DeviceSession },
  ): Promise<WorkspaceLease> {
    const secret = decryptWorkspace(w, (await this.keys(false)).credential),
      controller = new AbortController(),
      key = `${this.root}/${device ? device.session.id : w.id}`,
      registry = device ? operations() : workspaceOperations(),
      set = registry.get(key) ?? new Set<AbortController>();
    set.add(controller);
    registry.set(key, set);
    const context = {
      identity: w.identity,
      gitUsername: w.gitUsername,
      secret,
      signal: signal
        ? AbortSignal.any([signal, controller.signal])
        : controller.signal,
    };
    return {
      accountId: w.accountId,
      workspaceId: w.id,
      connection: connectionSummary(w),
      context,
      assertCurrent: async () => {
        if (controller.signal.aborted) throw denied();
        context.signal.throwIfAborted();
        const latest = await this.load(),
          current = device && this.find(latest, device.cookie);
        if (
          (device &&
            (!current ||
              current.accountId !== w.accountId ||
              current.id !== device.session.id ||
              current.workspaceId !== w.id ||
              current.selectionRevision !==
                device.session.selectionRevision)) ||
          !latest.accounts.some((a) => a.id === w.accountId) ||
          !latest.workspaces.some(
            (x) =>
              x.id === w.id &&
              x.accountId === w.accountId &&
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
  }
  async updatePreferences(
    cookie: string,
    input: unknown,
    expectedWorkspaceId?: string,
    expectedRevision?: number,
  ) {
    const parsed = preferencesSchema.safeParse(input);
    if (!parsed.success)
      throw new AppError("INVALID_PARAMETER", "工作台偏好不合法。", 400);
    return this.lock(async () => {
      const state = await this.load();
      await this.prune(state);
      const s = this.require(state, cookie, expectedRevision);
      const w = state.workspaces.find(
        (w) => w.id === s.workspaceId && w.accountId === s.accountId,
      );
      if (!w) throw denied();
      if (expectedWorkspaceId && w.id !== expectedWorkspaceId)
        throw new AppError("WORKSPACE_CHANGED", "Token 已切换，请重试。", 409);
      const r = parsed.data.repository;
      if (r && (r.providerId !== w.providerId || r.instanceId !== w.instanceId))
        throw new AppError(
          "INVALID_PARAMETER",
          "最近仓库必须属于当前平台。",
          400,
        );
      const { repository, ...rest } = parsed.data;
      w.preferences = { ...w.preferences, ...rest };
      if (repository) {
        const { integrationBranch, ...identity } = repository;
        w.preferences.repository = {
          ...identity,
          ...(integrationBranch
            ? { collaborationBranch: integrationBranch }
            : {}),
        };
      } else if (Object.hasOwn(parsed.data, "repository")) {
        w.preferences.repository = repository;
      }
      await this.save(state);
      return publicPreferences(w.preferences);
    });
  }
  async devices(cookie: string, expectedRevision?: number) {
    return this.lock(async () => {
      const state = await this.load();
      await this.prune(state);
      const current = this.require(state, cookie, expectedRevision);
      return state.sessions
        .filter((s) => s.accountId === current.accountId)
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
  async revokeDevice(cookie: string, id: string, expectedRevision?: number) {
    return this.lock(async () => {
      const state = await this.load();
      await this.prune(state);
      const current = this.require(state, cookie, expectedRevision);
      const device = state.sessions.find(
        (s) => s.id === id && s.accountId === current.accountId,
      );
      if (!device) throw new AppError("DEVICE_NOT_FOUND", "设备不存在。", 404);
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
  const root = join(dataDirectory(), "personal"),
    stores = (globals.folioWorkspaceStores ??= new Map());
  let store = stores.get(root);
  if (!store) {
    store = new PersonalSessions(root);
    stores.set(root, store);
  }
  return store;
}
