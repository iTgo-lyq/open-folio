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
      const assertRead = async () => {
        await verifyIdentity();
        const current = await provider.resolveRepository(
          lease.context,
          repository,
        );
        if (repositoryKey(current) !== key)
          throw new AppError("REPOSITORY_MISMATCH", "仓库身份已变化。", 403);
        await provider.assertRead(lease.context, current);
        await this.git(provider, lease.context, current);
        await lease.assertCurrent();
      };
      await assertRead();
      const transport = await provider.gitTransport(lease.context, repository);
      const cache = join(
        this.root,
        lease.sessionId,
        connectionId,
        String(lease.connection.revision),
      );
      const store = new SnapshotStore(cache, (dir) => {
        const reader = this.readerFactory(dir, transport);
        reader.signal = lease.context.signal;
        return reader;
      });
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
          const previous = locks.get(path) ?? Promise.resolve();
          // Serialize Git writes, but never borrow another request's authorization.
          const next = previous
            .catch(() => {})
            .then(async () => {
              await assertRead();
              return store.refresh(project, limits, {
                signal: lease.context.signal,
                beforePublish: assertRead,
              });
            });
          locks.set(path, next);
          try {
            return await next;
          } finally {
            if (locks.get(path) === next) locks.delete(path);
          }
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
    join(dataDirectory(), "repositories-v1"),
    personalSessions(),
    discovery(),
  );
}
