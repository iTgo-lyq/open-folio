import "server-only";
import { AUTO_REFRESH_MS, type Limits } from "../lib/model.ts";
import { limitsFor, readConfig } from "./config.ts";
import { publicError } from "./errors.ts";
import { repositories, type Repositories } from "./repositories.ts";
import type { DiscoveredRepository } from "./discovery.ts";

export const IDLE_REFRESH_MS = 5 * AUTO_REFRESH_MS;
const ACTIVE_GRACE_MS = 2 * AUTO_REFRESH_MS;
const CONCURRENCY = 2;
const state = globalThis as typeof globalThis & {
  folioRepositoryActivity?: Map<string, Map<string, number>>;
  folioBackgroundRefresh?: RepositoryRefresher;
};
const activityFor = (root: string) => {
  const roots = (state.folioRepositoryActivity ??= new Map());
  if (!roots.has(root)) roots.set(root, new Map());
  return roots.get(root)!;
};
const targetKey = (workspace: string, repository: string, branch: string) =>
  JSON.stringify([workspace, repository, branch]);
type RefreshOptions = {
  now?: () => number;
  limits?: () => Promise<Limits>;
  onError?: (error: unknown) => void;
};

export function noteRepositoryActivity(
  root: string,
  workspace: string,
  repository: string,
  branch: string,
  now = Date.now(),
) {
  activityFor(root).set(targetKey(workspace, repository, branch), now);
}

export class RepositoryRefresher {
  private repos: Repositories;
  private options: RefreshOptions;
  private completed = new Map<string, number>();
  private running?: Promise<void>;
  private timer?: ReturnType<typeof setTimeout>;
  private started = false;
  private controller = new AbortController();
  constructor(repos: Repositories, options: RefreshOptions = {}) {
    this.repos = repos;
    this.options = options;
  }
  private now() {
    return this.options.now?.() ?? Date.now();
  }
  private report(error: unknown) {
    if (!this.controller.signal.aborted)
      if (this.options.onError) this.options.onError(error);
      else
        console.error("OpenFolio background refresh:", publicError(error).code);
  }
  start() {
    if (this.started || this.controller.signal.aborted) return;
    this.started = true;
    const tick = async () => {
      try {
        await this.scan();
      } catch (error) {
        this.report(error);
      } finally {
        if (!this.controller.signal.aborted) {
          this.timer = setTimeout(() => void tick(), AUTO_REFRESH_MS);
          this.timer.unref();
        }
      }
    };
    void tick();
  }
  stop() {
    this.controller.abort();
    clearTimeout(this.timer);
  }
  scan(): Promise<void> {
    if (this.controller.signal.aborted) return Promise.resolve();
    if (!this.running)
      this.running = this.collect().finally(() => {
        this.running = undefined;
      });
    return this.running;
  }
  private async collect() {
    const bindings = await this.repos.sessions.repositoryBindings();
    const targets: {
      binding: (typeof bindings)[number];
      repository: DiscoveredRepository;
      id: string;
    }[] = [];
    const activity = activityFor(this.repos.root);
    const known = new Set<string>();
    for (const binding of bindings) {
      if (this.controller.signal.aborted) return;
      try {
        const found = await this.repos.discoveries.knownRepositories(
          binding.workspaceId,
        );
        for (const repository of found) {
          const id = targetKey(
            binding.workspaceId,
            repository.key,
            repository.integrationBranch,
          );
          if (known.has(id)) continue;
          known.add(id);
          targets.push({ binding, repository, id });
        }
      } catch (error) {
        this.report(error);
      }
    }
    for (const map of [this.completed, activity])
      for (const id of map.keys()) if (!known.has(id)) map.delete(id);
    if (!targets.length || this.controller.signal.aborted) return;
    const limits = await (this.options.limits?.() ??
      readConfig().then(limitsFor));
    let index = 0;
    const worker = async () => {
      while (!this.controller.signal.aborted && index < targets.length) {
        const { binding, repository, id } = targets[index++];
        const now = this.now();
        const age = now - (activity.get(id) ?? -Infinity);
        const interval =
          age >= 0 && age < ACTIVE_GRACE_MS ? AUTO_REFRESH_MS : IDLE_REFRESH_MS;
        const completed = this.completed.get(id);
        if (
          completed !== undefined &&
          now >= completed &&
          now - completed < interval
        )
          continue;
        try {
          await this.repos.readShared(
            binding.accountId,
            binding.workspaceId,
            repository.key,
            repository.repository,
            repository.integrationBranch,
            (ctx) => ctx.refresh(limits, true),
            this.controller.signal,
          );
        } catch (error) {
          this.report(error);
        } finally {
          this.completed.set(id, this.now());
        }
      }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  }
}

export function startBackgroundRefresh() {
  if (state.folioBackgroundRefresh) return;
  const refresher = new RepositoryRefresher(repositories());
  state.folioBackgroundRefresh = refresher;
  process.once("SIGTERM", () => refresher.stop());
  process.once("SIGINT", () => refresher.stop());
  refresher.start();
}
