import "server-only";
import {
  mkdir,
  readFile,
  writeFile,
  rename,
  rm,
  mkdtemp,
} from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { workflowSchema } from "./schema.ts";
import { GitReader } from "./git.ts";
import { AppError } from "./errors.ts";
import { dataDirectory } from "./config.ts";
import {
  personalSessions,
  type PersonalSessions,
  type ConnectionLease,
} from "./personal-sessions.ts";
import {
  repositoryKey,
  ProviderError,
  type RepositoryIdentity,
  type ProviderContext,
  type RepositoryProvider,
} from "./providers/types.ts";
import type {
  RepositoryState,
  DiscoveryState,
  DiscoverySummary,
} from "../lib/personal.ts";
export interface DiscoveredRepository {
  key: string;
  repository: RepositoryIdentity;
  state: RepositoryState;
  message?: string;
  specBranch?: string;
}
interface Job {
  revision: number;
  state: DiscoveryState;
  cursor: string | null;
  pending: RepositoryIdentity[];
  started: boolean;
  results: DiscoveredRepository[];
  message?: string;
  retryAfter?: string;
  updatedAt: string;
}
const repoSchema = z.object({
  providerId: z.string(),
  instanceId: z.string(),
  repositoryId: z.string(),
  fullName: z.string(),
  displayName: z.string(),
  webUrl: z.string(),
  cloneUrl: z.string(),
  defaultBranch: z.string().nullable(),
});
const jobSchema = z.object({
  revision: z.number().int().positive(),
  state: z.enum(["running", "complete", "partial", "interrupted"]),
  cursor: z.string().nullable(),
  pending: z.array(repoSchema),
  started: z.boolean(),
  results: z.array(
    z.object({
      key: z.string().regex(/^[a-f0-9]{64}$/),
      repository: repoSchema,
      state: z.enum(["ready", "attention", "not-integrated", "unavailable"]),
      message: z.string().optional(),
      specBranch: z.string().optional(),
    }),
  ),
  message: z.string().optional(),
  retryAfter: z.string().optional(),
  updatedAt: z.string(),
});
class Semaphore {
  active = 0;
  waiting: (() => void)[] = [];
  async use<T>(signal: AbortSignal, fn: () => Promise<T>): Promise<T> {
    if (this.active >= 8)
      await new Promise<void>((resolve, reject) => {
        const ready = () => {
          signal.removeEventListener("abort", abort);
          resolve();
        };
        const abort = () => {
          this.waiting = this.waiting.filter((x) => x !== ready);
          reject(new AppError("OPERATION_CANCELLED", "操作已取消。"));
        };
        if (signal.aborted) {
          reject(new AppError("OPERATION_CANCELLED", "操作已取消。"));
          return;
        }
        signal.addEventListener("abort", abort, { once: true });
        this.waiting.push(ready);
      });
    else this.active++;
    try {
      signal.throwIfAborted();
      return await fn();
    } finally {
      const next = this.waiting.shift();
      if (next) next();
      else this.active--;
    }
  }
}
const processState = globalThis as typeof globalThis & {
  folioDiscovery?: Map<string, Discovery>;
  folioProbeSlots?: Semaphore;
};
const slots = () => (processState.folioProbeSlots ??= new Semaphore());
export type GitProbe = (
  provider: RepositoryProvider,
  context: ProviderContext,
  repo: RepositoryIdentity,
) => Promise<Map<string, string>>;
export const probeGit: GitProbe = async (provider, context, repo) => {
  const dir = await mkdtemp(join(tmpdir(), "folio-git-probe-"));
  try {
    const reader = new GitReader(
      dir,
      await provider.gitTransport(context, repo),
    );
    const text = (
      await reader.run(
        ["ls-remote", "--symref", reader.url, "HEAD", "refs/heads/*"],
        context.signal,
      )
    ).toString();
    const refs = new Map<string, string>();
    for (const line of text.split("\n")) {
      const m = /^([a-f0-9]{40,64})\trefs\/heads\/(.+)$/.exec(line);
      if (m) refs.set(m[2], m[1]);
    }
    return refs;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
};
const found = (job: Job) =>
  job.results.filter((r) => ["ready", "attention"].includes(r.state));
const summary = (job: Job): DiscoverySummary => ({
  state: job.state,
  checked: job.results.length,
  found: found(job).length,
  failed: job.results.filter((r) => r.state === "unavailable").length,
  hasMore: !job.started || !!job.cursor || !!job.pending.length,
  ...(job.message ? { message: job.message } : {}),
  ...(job.retryAfter ? { retryAfter: job.retryAfter } : {}),
  updatedAt: job.updatedAt,
});
export class Discovery {
  readonly root: string;
  readonly sessions: PersonalSessions;
  readonly git: GitProbe;
  private active = new Map<string, Promise<void>>();
  private starts = new Map<string, Promise<DiscoverySummary>>();
  private writes = new Map<string, Promise<unknown>>();
  constructor(
    root: string,
    sessions: PersonalSessions,
    git: GitProbe = probeGit,
  ) {
    this.root = root;
    this.sessions = sessions;
    this.git = git;
  }
  private path(lease: ConnectionLease) {
    return join(
      this.root,
      lease.sessionId,
      lease.connection.id,
      `${lease.connection.revision}.json`,
    );
  }
  private async read(lease: ConnectionLease): Promise<Job | null> {
    try {
      return jobSchema.parse(
        JSON.parse(await readFile(this.path(lease), "utf8")),
      );
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw new AppError(
        "DISCOVERY_DATA_INVALID",
        "发现记录不可读，请重新发现仓库。",
      );
    }
  }
  private async write(lease: ConnectionLease, job: Job) {
    const path = this.path(lease);
    const data = JSON.stringify({
      ...job,
      updatedAt: new Date().toISOString(),
    });
    const previous = this.writes.get(path) ?? Promise.resolve();
    const next = previous
      .catch(() => {})
      .then(async () => {
        await lease.assertCurrent();
        await mkdir(join(path, ".."), { recursive: true, mode: 0o700 });
        const tmp = `${path}.${randomUUID()}.tmp`;
        try {
          await writeFile(tmp, data, { mode: 0o600, flag: "wx" });
          await lease.assertCurrent();
          await rename(tmp, path);
        } finally {
          await rm(tmp, { force: true });
        }
      });
    this.writes.set(path, next);
    try {
      await next;
    } finally {
      if (this.writes.get(path) === next) this.writes.delete(path);
    }
  }
  private async identity(lease: ConnectionLease) {
    const provider = this.sessions.registry.get(
      lease.context.identity.providerId,
    );
    const actual = await provider.authenticate(
      lease.context.secret,
      lease.context.signal,
    );
    if (actual.subjectId !== lease.context.identity.subjectId)
      throw new ProviderError(
        "IDENTITY_CHANGED",
        "连接身份已改变，请重新连接。",
        401,
      );
    await lease.assertCurrent();
    return provider;
  }
  async diagnose(
    provider: RepositoryProvider,
    context: ProviderContext,
    repository: RepositoryIdentity,
  ): Promise<DiscoveredRepository> {
    const key = repositoryKey(repository);
    const probe = await provider.probeWorkflow(context, repository);
    if (probe.kind === "missing" || probe.kind === "empty-repository")
      return {
        key,
        repository,
        state: "not-integrated",
        message: "默认分支尚未发现 SpecTrail 配置。",
      };
    if (probe.kind === "unavailable")
      return {
        key,
        repository,
        state:
          probe.reason === "WORKFLOW_INVALID" ? "attention" : "unavailable",
        message:
          probe.reason === "WORKFLOW_INVALID"
            ? "工作流路径不是普通文件。"
            : "暂时无法检查工作流。",
      };
    let workflow: z.infer<typeof workflowSchema>;
    try {
      workflow = workflowSchema.parse(
        JSON.parse(Buffer.from(probe.bytes).toString("utf8")),
      );
    } catch {
      return {
        key,
        repository,
        state: "attention",
        message: "SpecTrail 配置损坏或版本不受支持。",
      };
    }
    const refs = await this.git(provider, context, repository);
    if (
      !repository.defaultBranch ||
      refs.get(repository.defaultBranch) !== probe.commit
    )
      return {
        key,
        repository,
        state: "attention",
        message: "默认分支已变化或无法定位，请重新检查。",
      };
    if (workflow.protectedBranches.some((b) => !refs.has(b)))
      return {
        key,
        repository,
        state: "attention",
        message: "配置声明的守护分支不存在。",
      };
    if (!workflow.protectedBranches.includes(repository.defaultBranch))
      return {
        key,
        repository,
        state: "attention",
        message: "默认分支未登记为守护分支，请选择有效阅读来源。",
      };
    return {
      key,
      repository,
      state: "ready",
      specBranch: repository.defaultBranch,
    };
  }
  async start(cookie: string, id: string, retry = false) {
    const lease = await this.sessions.lease(cookie, id);
    const path = this.path(lease);
    lease.release();
    const existing = this.starts.get(path);
    if (existing) return existing;
    const pending = this.begin(cookie, id, retry);
    this.starts.set(path, pending);
    try {
      return await pending;
    } finally {
      if (this.starts.get(path) === pending) this.starts.delete(path);
    }
  }
  private async begin(cookie: string, id: string, retry = false) {
    const lease = await this.sessions.lease(cookie, id);
    let retained = false;
    try {
      const path = this.path(lease);
      const previous = await this.read(lease);
      if (previous?.retryAfter) {
        const remaining = Math.ceil(
          (Date.parse(previous.updatedAt) +
            Number(previous.retryAfter) * 1000 -
            Date.now()) /
            1000,
        );
        if (remaining > 0)
          throw new ProviderError(
            "RATE_LIMITED",
            "平台限流尚未解除，请稍后重试。",
            429,
            String(remaining),
          );
      }
      const provider = await this.identity(lease);
      if (this.active.has(path) && previous) return summary(previous);
      const job: Job =
        retry && previous && previous.state !== "complete"
          ? {
              ...previous,
              state: "running",
              message: undefined,
              retryAfter: undefined,
            }
          : {
              revision: lease.connection.revision,
              state: "running",
              cursor: null,
              pending: [],
              started: false,
              results: [],
              updatedAt: new Date().toISOString(),
            };
      if (retry) {
        const failed = job.results.filter((r) => r.state === "unavailable");
        job.pending.push(...failed.map((r) => r.repository));
        job.results = job.results.filter((r) => r.state !== "unavailable");
      }
      await this.write(lease, job);
      retained = true;
      const running = this.run(lease, provider, job).finally(() => {
        lease.release();
        this.active.delete(path);
      });
      this.active.set(path, running);
      void running.catch(() => {});
      return summary(job);
    } finally {
      if (!retained) lease.release();
    }
  }
  private async run(
    lease: ConnectionLease,
    provider: RepositoryProvider,
    job: Job,
  ) {
    try {
      while (!job.started || job.cursor || job.pending.length) {
        await lease.assertCurrent();
        if (!job.pending.length) {
          const page = await provider.listRepositories(
            lease.context,
            job.cursor,
          );
          job.pending = [
            ...new Map(
              page.items
                .filter(
                  (r) => !job.results.some((x) => x.key === repositoryKey(r)),
                )
                .map((r) => [repositoryKey(r), r]),
            ).values(),
          ];
          job.cursor = page.nextCursor;
          job.started = true;
          await this.write(lease, job);
        }
        const batch = job.pending.slice(0, 4);
        let pause: unknown;
        await Promise.all(
          batch.map((repository) =>
            slots().use(lease.context.signal, async () => {
              try {
                const context = {
                  ...lease.context,
                  signal: AbortSignal.any([
                    lease.context.signal,
                    AbortSignal.timeout(20_000),
                  ]),
                };
                const result = await this.diagnose(
                  provider,
                  context,
                  repository,
                );
                await lease.assertCurrent();
                job.results.push(result);
                job.pending = job.pending.filter(
                  (r) => repositoryKey(r) !== result.key,
                );
              } catch (e) {
                if (
                  e instanceof ProviderError &&
                  [
                    "RATE_LIMITED",
                    "TOKEN_INVALID",
                    "IDENTITY_CHANGED",
                  ].includes(e.code)
                ) {
                  pause = e;
                  return;
                }
                if (lease.context.signal.aborted) throw e;
                job.results.push({
                  key: repositoryKey(repository),
                  repository,
                  state: "unavailable",
                  message: "检查未完成，请确认读取权限或重试。",
                });
                job.pending = job.pending.filter(
                  (r) => repositoryKey(r) !== repositoryKey(repository),
                );
              }
            }),
          ),
        );
        await this.write(lease, job);
        if (pause) throw pause;
      }
      job.state = job.results.some((r) => r.state === "unavailable")
        ? "partial"
        : "complete";
      await this.write(lease, job);
    } catch (e) {
      job.state = "partial";
      job.message = e instanceof AppError ? e.message : "发现已中断，请重试。";
      job.retryAfter = e instanceof ProviderError ? e.retryAfter : undefined;
      await this.write(lease, job).catch(() => {});
    }
  }
  async status(cookie: string, id: string) {
    const lease = await this.sessions.lease(cookie, id);
    try {
      await this.identity(lease);
      const job = await this.read(lease);
      if (!job) return null;
      if (job.state === "running" && !this.active.has(this.path(lease))) {
        job.state = "interrupted";
        job.message = "服务重启后发现已中断，请重试。";
        await this.write(lease, job);
      }
      await lease.assertCurrent();
      return summary(job);
    } finally {
      lease.release();
    }
  }
  async list(cookie: string, id: string, offset = 0) {
    if (!Number.isInteger(offset) || offset < 0 || offset > 100000)
      throw new AppError("INVALID_PARAMETER", "目录页码不合法。", 400);
    const lease = await this.sessions.lease(cookie, id);
    try {
      const provider = await this.identity(lease),
        job = await this.read(lease),
        all = job ? found(job) : [];
      const items: DiscoveredRepository[] = [];
      let unavailable = 0;
      for (const item of all.slice(offset, offset + 20)) {
        await slots().use(lease.context.signal, async () => {
          const context = {
            ...lease.context,
            signal: AbortSignal.any([
              lease.context.signal,
              AbortSignal.timeout(20_000),
            ]),
          };
          try {
            const repository = await provider.resolveRepository(
              context,
              item.repository,
            );
            await provider.assertRead(context, repository);
            await this.git(provider, context, repository);
            items.push({ ...item, repository });
          } catch (e) {
            if (
              e instanceof ProviderError &&
              [
                "TOKEN_INVALID",
                "RATE_LIMITED",
                "PROVIDER_UNAVAILABLE",
                "IDENTITY_CHANGED",
              ].includes(e.code)
            )
              throw e;
            unavailable++;
          }
        });
      }
      // A page can take multiple remote calls. Recheck every retained repository
      // before delivery, including entries checked early in the initial pass.
      await this.identity(lease);
      const verification = await Promise.allSettled(
        items.map((item) =>
          slots().use(lease.context.signal, async () => {
            const context = {
              ...lease.context,
              signal: AbortSignal.any([
                lease.context.signal,
                AbortSignal.timeout(20_000),
              ]),
            };
            try {
              const repository = await provider.resolveRepository(
                context,
                item.repository,
              );
              await provider.assertRead(context, repository);
              await this.git(provider, context, repository);
              return { ...item, repository };
            } catch (e) {
              if (
                e instanceof ProviderError &&
                [
                  "TOKEN_INVALID",
                  "RATE_LIMITED",
                  "PROVIDER_UNAVAILABLE",
                  "IDENTITY_CHANGED",
                ].includes(e.code)
              )
                throw e;
              unavailable++;
              return null;
            }
          }),
        ),
      );
      const failed = verification.find(
        (result) => result.status === "rejected",
      );
      if (failed?.status === "rejected") throw failed.reason;
      const verified = verification.flatMap((result) =>
        result.status === "fulfilled" ? [result.value] : [],
      );
      await this.identity(lease);
      await lease.assertCurrent();
      return {
        items: verified.filter(
          (item): item is DiscoveredRepository => item !== null,
        ),
        unavailable,
        nextOffset: offset + 20 < all.length ? offset + 20 : null,
      };
    } finally {
      lease.release();
    }
  }
  async check(
    cookie: string,
    id: string,
    selector: string | { fullName: string; repositoryId?: string },
  ) {
    const lease = await this.sessions.lease(cookie, id);
    try {
      const provider = await this.identity(lease),
        repo = await provider.resolveRepository(
          lease.context,
          typeof selector === "string"
            ? provider.parseRepositoryUrl(selector)
            : selector,
        );
      const result = await slots().use(lease.context.signal, () =>
        this.diagnose(provider, lease.context, repo),
      );
      await lease.assertCurrent();
      const job = (await this.read(lease)) ?? {
        revision: lease.connection.revision,
        state: "partial" as const,
        cursor: null,
        pending: [],
        started: false,
        results: [],
        updatedAt: new Date().toISOString(),
      };
      if (
        this.active.has(this.path(lease)) ||
        this.starts.has(this.path(lease))
      )
        throw new AppError(
          "DISCOVERY_RUNNING",
          "仓库发现仍在进行，请稍后重新检查地址。",
          409,
        );
      job.results = job.results
        .filter((r) => r.key !== result.key)
        .concat(result);
      await this.write(lease, job);
      await this.identity(lease);
      const current = await provider.resolveRepository(lease.context, repo);
      await provider.assertRead(lease.context, current);
      await this.git(provider, lease.context, current);
      await lease.assertCurrent();
      return { ...result, repository: current };
    } finally {
      lease.release();
    }
  }
  async wait(cookie: string, id: string) {
    const lease = await this.sessions.lease(cookie, id);
    try {
      await this.active.get(this.path(lease));
    } finally {
      lease.release();
    }
  }
  async lookup(lease: ConnectionLease, key: string) {
    await lease.assertCurrent();
    return (await this.read(lease))?.results.find(
      (item) => item.key === key && ["ready", "attention"].includes(item.state),
    );
  }
}
export function discovery() {
  const sessions = personalSessions(),
    root = join(dataDirectory(), "discovery-v1");
  const stores = (processState.folioDiscovery ??= new Map());
  let service = stores.get(root);
  if (!service) {
    service = new Discovery(root, sessions);
    stores.set(root, service);
  }
  return service;
}
