import "server-only";
import { join } from "node:path";
import { dataDirectory } from "./config.ts";
import {
  discovery,
  type Discovery,
  probeGit,
  type GitProbe,
} from "./discovery.ts";
import {
  personalSessions,
  type PersonalSessions,
  type ConnectionLease,
} from "./personal-sessions.ts";
import { GitReader } from "./git.ts";
import { SnapshotStore } from "./store.ts";
import { AppError } from "./errors.ts";
import {
  repositoryKey,
  ProviderError,
  type RepositoryIdentity,
  type RepositorySelector,
  type GitTransport,
} from "./providers/types.ts";
import type { ProjectConfig, Limits } from "../lib/model.ts";
export interface ReadContext {
  lease: ConnectionLease;
  repository: RepositoryIdentity;
  project: ProjectConfig;
  store: SnapshotStore;
  assertRead(): Promise<void>;
  refresh(limits: Limits): ReturnType<SnapshotStore["refresh"]>;
}
type ReaderFactory = (directory: string, transport: GitTransport) => GitReader;
const state = globalThis as typeof globalThis & {
  folioRefreshes?: Map<string, Promise<unknown>>;
};
export class Repositories {
  readonly root: string;
  readonly sessions: PersonalSessions;
  readonly discoveries: Discovery;
  readonly git: GitProbe;
  readonly readerFactory: ReaderFactory;
  constructor(
    root: string,
    sessions: PersonalSessions,
    discoveries: Discovery,
    git: GitProbe = probeGit,
    readerFactory: ReaderFactory = (dir, transport) =>
      new GitReader(dir, transport),
  ) {
    Object.assign(this, { root, sessions, discoveries, git, readerFactory });
    this.root = root;
    this.sessions = sessions;
    this.discoveries = discoveries;
    this.git = git;
    this.readerFactory = readerFactory;
  }
  async read<T>(
    cookie: string,
    connectionId: string,
    key: string,
    operation: (context: ReadContext) => Promise<T>,
    selector?: RepositorySelector,
    signal?: AbortSignal,
  ): Promise<T> {
    if (!/^[a-f0-9]{64}$/.test(key))
      throw new AppError("REPOSITORY_NOT_FOUND", "仓库不存在。", 404);
    const lease = await this.sessions.lease(cookie, connectionId, signal);
    try {
      const provider = this.sessions.registry.get(
        lease.context.identity.providerId,
      );
      const verifyIdentity = async () => {
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
      };
      await verifyIdentity();
      const found = await this.discoveries.lookup(lease, key);
      const target = found?.repository ?? selector;
      if (!target)
        throw new AppError(
          "REPOSITORY_NOT_FOUND",
          "请先发现或检查这个仓库。",
          404,
        );
      const repository = await provider.resolveRepository(
        lease.context,
        target,
      );
      if (repositoryKey(repository) !== key)
        throw new AppError(
          "REPOSITORY_MISMATCH",
          "链接的仓库身份不匹配。",
          404,
        );
      if (!found) {
        const diagnosed = await this.discoveries.diagnose(
          provider,
          lease.context,
          repository,
        );
        if (!["ready", "attention"].includes(diagnosed.state))
          throw new AppError(
            "WORKFLOW_NOT_FOUND",
            diagnosed.message ?? "该仓库尚未接入 SpecTrail。",
            409,
          );
      }
      const assertPermission = async (owner: ConnectionLease) => {
        const actual = await provider.authenticate(
          owner.context.secret,
          owner.context.signal,
        );
        if (
          actual.subjectId !== owner.context.identity.subjectId ||
          actual.providerId !== owner.context.identity.providerId ||
          actual.instanceId !== owner.context.identity.instanceId
        )
          throw new ProviderError(
            "IDENTITY_CHANGED",
            "凭据身份已改变，请重新登录。",
            401,
          );
        await owner.assertCurrent();
        const current = await provider.resolveRepository(
          owner.context,
          repository,
        );
        if (repositoryKey(current) !== key)
          throw new AppError("REPOSITORY_MISMATCH", "仓库身份已变化。", 403);
        await provider.assertRead(owner.context, current);
        await this.git(provider, owner.context, current);
        await owner.assertCurrent();
      };
      const assertRead = () => assertPermission(lease);
      await assertRead();
      const cache = join(this.root, lease.workspaceId);
      const makeStore = async (owner: ConnectionLease) => {
        const transport = await provider.gitTransport(
          owner.context,
          repository,
        );
        return new SnapshotStore(
          cache,
          (dir) => {
            const reader = this.readerFactory(dir, transport);
            reader.signal = owner.context.signal;
            return reader;
          },
          key,
        );
      };
      const store = await makeStore(lease);
      const project: ProjectConfig = {
        id: key,
        name: repository.fullName,
        repositoryUrl: repository.cloneUrl,
      };
      const context: ReadContext = {
        lease,
        repository,
        project,
        store,
        assertRead,
        refresh: async (limits) => {
          const locks = (state.folioRefreshes ??= new Map());
          const path = store.directory(project);
          // A credential-owned job survives an individual device logout. Each
          // waiting device still authorizes its own response before delivery.
          let next = locks.get(path);
          if (!next) {
            next = (async () => {
              const owner = await this.sessions.workspaceLease(
                cookie,
                connectionId,
              );
              try {
                await assertPermission(owner);
                const shared = await makeStore(owner);
                return await shared.refresh(project, limits, {
                  signal: owner.context.signal,
                  beforePublish: () => assertPermission(owner),
                });
              } finally {
                owner.release();
              }
            })();
            locks.set(path, next);
            void next
              .finally(() => {
                if (locks.get(path) === next) locks.delete(path);
              })
              .catch(() => {});
          }
          const result = await next;
          await assertRead();
          return result as Awaited<ReturnType<SnapshotStore["refresh"]>>;
        },
      };
      const result = await operation(context);
      await assertRead();
      return result;
    } finally {
      lease.release();
    }
  }
}
export function repositories() {
  return new Repositories(
    join(dataDirectory(), "repositories-v2"),
    personalSessions(),
    discovery(),
  );
}
