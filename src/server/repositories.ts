import "server-only";
import { join } from "node:path";
import { dataDirectory } from "./config.ts";
import { discovery, type Discovery } from "./discovery.ts";
import {
  personalSessions,
  type PersonalSessions,
  type WorkspaceLease,
} from "./personal-sessions.ts";
import {
  SUGGESTED_INTEGRATION_BRANCH,
  validBranchName,
} from "../lib/collaboration.ts";
import { hash, GitReader } from "./git.ts";
import { SnapshotStore } from "./store.ts";
import { AppError } from "./errors.ts";
import { repositoryPermissions } from "./repository-permissions.ts";
import {
  type RepositoryIdentity,
  type RepositorySelector,
  type GitTransport,
  repositoryKey,
} from "./providers/types.ts";
import type { ProjectConfig, Limits } from "../lib/model.ts";
export interface ReadContext {
  lease: WorkspaceLease;
  repository: RepositoryIdentity;
  project: ProjectConfig;
  store: SnapshotStore;
  assertRead(force?: boolean): Promise<void>;
  refresh(
    limits: Limits,
    automatic?: boolean,
  ): ReturnType<SnapshotStore["refresh"]>;
}
type ReaderFactory = (directory: string, transport: GitTransport) => GitReader;
const state = globalThis as typeof globalThis & {
  folioRefreshes?: Map<string, Promise<unknown>>;
};
export class Repositories {
  readonly root: string;
  readonly sessions: PersonalSessions;
  readonly discoveries: Discovery;
  readonly readerFactory: ReaderFactory;
  constructor(
    root: string,
    sessions: PersonalSessions,
    discoveries: Discovery,
    readerFactory: ReaderFactory = (dir, transport) =>
      new GitReader(dir, transport),
  ) {
    this.root = root;
    this.sessions = sessions;
    this.discoveries = discoveries;
    this.readerFactory = readerFactory;
  }
  async read<T>(
    cookie: string,
    connectionId: string,
    key: string,
    operation: (context: ReadContext) => Promise<T>,
    selector?: RepositorySelector,
    signal?: AbortSignal,
    selectedBranch?: string,
  ): Promise<T> {
    if (!/^[a-f0-9]{64}$/.test(key))
      throw new AppError("REPOSITORY_NOT_FOUND", "仓库不存在。", 404);
    const lease = await this.sessions.lease(cookie, connectionId, signal);
    try {
      const found = await this.discoveries.lookup(lease, key);
      const branch =
        selectedBranch ??
        found?.integrationBranch ??
        SUGGESTED_INTEGRATION_BRANCH;
      const target = found?.repository ?? selector;
      if (!target)
        throw new AppError(
          "REPOSITORY_NOT_FOUND",
          "请先发现或检查这个仓库。",
          404,
        );
      return await this.readLease(
        lease,
        key,
        target,
        branch,
        operation,
        !found || found.integrationBranch !== branch,
      );
    } finally {
      lease.release();
    }
  }
  async readShared<T>(
    accountId: string,
    workspaceId: string,
    key: string,
    target: RepositorySelector,
    branch: string,
    operation: (context: ReadContext) => Promise<T>,
    signal?: AbortSignal,
  ): Promise<T> {
    const lease = await this.sessions.credentialLease(
      accountId,
      workspaceId,
      signal,
    );
    try {
      return await this.readLease(lease, key, target, branch, operation);
    } finally {
      lease.release();
    }
  }
  private async readLease<T>(
    lease: WorkspaceLease,
    key: string,
    target: RepositorySelector,
    integrationBranch: string,
    operation: (context: ReadContext) => Promise<T>,
    diagnose = false,
  ): Promise<T> {
    const permissions = repositoryPermissions(this.sessions);
    try {
      if (!validBranchName(integrationBranch))
        throw new AppError("INVALID_PARAMETER", "集成分支名称不合法。", 400);
      const provider = this.sessions.registry.get(
        lease.context.identity.providerId,
      );
      const repository = await permissions.checkWorkspace(lease, key, target, {
        integrationBranch,
      });
      if (diagnose) {
        const result = await this.discoveries.diagnose(
          provider,
          lease.context,
          repository,
          integrationBranch,
        );
        if (!["ready", "attention"].includes(result.state))
          throw new AppError(
            "WORKFLOW_NOT_FOUND",
            result.message ?? "该仓库尚未接入 SpecTrail。",
            409,
          );
      }
      const assertPermission = async (owner: WorkspaceLease, force = false) => {
        await permissions.checkWorkspace(owner, key, repository, {
          force,
          integrationBranch,
          workspaceOwned: owner !== lease,
        });
        await owner.assertCurrent();
      };
      const assertRead = (force = false) => assertPermission(lease, force);
      const assertTracked = async (owner: WorkspaceLease) => {
        const current = await permissions.checkWorkspace(
          owner,
          key,
          repository,
          { integrationBranch, workspaceOwned: owner !== lease },
        );
        const preferences = await this.sessions.repositoryPreferences(owner);
        if (current.archived || preferences.untrackedRepositories?.[key])
          throw new AppError(
            "REPOSITORY_NOT_TRACKED",
            current.archived
              ? "仓库已归档，已停止追踪。"
              : "已停止追踪此仓库，请先在我的仓库中恢复追踪。",
            409,
          );
      };
      await lease.assertCurrent();
      const cache = join(this.root, lease.workspaceId);
      const dependencies = new Map<string, RepositoryIdentity>();
      const makeStore = async (owner: WorkspaceLease) => {
        const transport = await provider.gitTransport(
          owner.context,
          repository,
        );
        return new SnapshotStore(
          cache,
          (dir) => {
            const reader = this.readerFactory(dir, transport);
            reader.signal = owner.context.signal;
            const openSubmodule: NonNullable<GitReader["submodule"]> = async (
              url,
              commit,
              path,
              signal,
              force = false,
            ) => {
              try {
                const target = provider.parseRepositoryUrl(url);
                const child = await provider.resolveRepository(
                  owner.context,
                  target,
                );
                const childKey = repositoryKey(child);
                await permissions.checkWorkspace(owner, childKey, child, {
                  force,
                  integrationBranch: child.defaultBranch ?? undefined,
                  workspaceOwned: owner !== lease,
                });
                const childReader = this.readerFactory(
                  join(cache, "submodules", childKey),
                  await provider.gitTransport(owner.context, child),
                );
                childReader.signal = owner.context.signal;
                childReader.submodule = openSubmodule;
                try {
                  await childReader.ensureCommit(commit, signal);
                } catch {
                  signal.throwIfAborted();
                  throw new AppError(
                    "SUBMODULE_VERSION",
                    `子模块 ${path} 的指定版本 ${commit} 不可获取，请检查历史保留及版本权限。`,
                    422,
                  );
                }
                dependencies.set(childKey, child);
                return childReader;
              } catch (error) {
                if (
                  error instanceof AppError &&
                  [
                    "TOKEN_INVALID",
                    "IDENTITY_CHANGED",
                    "SUBMODULE_VERSION",
                  ].includes(error.code)
                )
                  throw error;
                throw new AppError(
                  "SUBMODULE_READ_DENIED",
                  `子模块 ${path} 不存在、当前账号无权访问，或仓库地址不受此连接支持。`,
                  403,
                );
              }
            };
            reader.submodule = openSubmodule;
            return reader;
          },
          hash(JSON.stringify([key, integrationBranch])),
        );
      };
      const store = await makeStore(lease);
      const project: ProjectConfig = {
        id: key,
        name: repository.fullName,
        repositoryUrl: repository.cloneUrl,
        integrationBranch,
      };
      const context: ReadContext = {
        lease,
        repository,
        project,
        store,
        assertRead: async (force = false) => {
          await assertRead(force);
          for (const [childKey, child] of dependencies)
            await permissions.checkWorkspace(lease, childKey, child, {
              force,
              integrationBranch: child.defaultBranch ?? undefined,
            });
        },
        refresh: async (limits, automatic = false) => {
          await assertTracked(lease);
          const locks = (state.folioRefreshes ??= new Map());
          const path = store.directory();
          // A credential-owned job survives an individual device logout. Each
          // waiting device must still have a valid session before delivery.
          let next = locks.get(path);
          if (!next) {
            next = (async () => {
              const owner = await this.sessions.credentialLease(
                lease.accountId,
                lease.workspaceId,
              );
              try {
                await owner.assertCurrent();
                const shared = await makeStore(owner);
                const snapshot = await shared.refresh(project, limits, {
                  automatic,
                  signal: owner.context.signal,
                  beforePublish: async () => {
                    await assertPermission(owner);
                    await assertTracked(owner);
                  },
                  delivery: provider.listPullRequests
                    ? {
                        repositoryId: repository.repositoryId,
                        cacheKey: JSON.stringify([
                          repository.providerId,
                          repository.instanceId,
                          repository.repositoryId,
                          repository.fullName,
                          provider.pullRequestCacheVersion,
                        ]),
                        list: (query, cursor, signal, etag) =>
                          provider.listPullRequests!(
                            {
                              ...owner.context,
                              signal: AbortSignal.any([
                                owner.context.signal,
                                signal,
                              ]),
                            },
                            repository,
                            query,
                            cursor,
                            etag,
                          ),
                      }
                    : undefined,
                });
                await owner.assertCurrent();
                permissions.assertAllowed(owner, key);
                return snapshot;
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
          return result as Awaited<ReturnType<SnapshotStore["refresh"]>>;
        },
      };
      const result = await operation(context);
      await lease.assertCurrent();
      permissions.assertAllowed(lease, key);
      for (const childKey of dependencies.keys())
        permissions.assertAllowed(lease, childKey);
      return result;
    } catch (error) {
      permissions.reject(lease, key, error);
      if (
        error instanceof AppError &&
        error.code === "GIT_READ_FAILED" &&
        target &&
        !lease.context.signal.aborted
      )
        await permissions.checkWorkspace(lease, key, target, {
          force: true,
          integrationBranch,
        });
      throw error;
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
