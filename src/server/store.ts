import {
  mkdir,
  readFile,
  writeFile,
  rename,
  unlink,
  readdir,
  open,
} from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { primaryRecord } from "../lib/model.ts";
import type {
  Limits,
  ProjectConfig,
  ProjectSummary,
  Snapshot,
  Workbench,
  SearchResult,
} from "../lib/model.ts";
import { GitReader, hash } from "./git.ts";
import { indexChanges } from "./changes.ts";
import { indexBase } from "./indexer.ts";
import { AppError, publicError } from "./errors.ts";
import { prototypePolicy, resolvePreview } from "./previews.ts";
import {
  prototypeCatalog,
  readCurrentPrototype,
  resolveCurrentPreview,
} from "./prototypes.ts";

const snapshotPattern = /^[a-f0-9-]{36}$/;
const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code !== "ESRCH";
  }
};
async function atomic(path: string, data: string | Buffer) {
  const tmp = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(tmp, data, { mode: 0o600 });
    await rename(tmp, path);
  } finally {
    await unlink(tmp).catch(() => {});
  }
}
export class SnapshotStore {
  root: string;
  private pending = new Map<string, Promise<Snapshot>>();
  private lock?: Promise<void>;
  private readerFactory: (
    directory: string,
    project: ProjectConfig,
  ) => GitReader;
  constructor(
    root: string,
    readerFactory = (directory: string, p: ProjectConfig) =>
      new GitReader(directory, p.repositoryUrl),
  ) {
    this.root = root;
    this.readerFactory = readerFactory;
  }
  fingerprint(p: ProjectConfig) {
    return hash(JSON.stringify([1, p.repositoryUrl, p.specBranch ?? null]));
  }
  directory(p: ProjectConfig) {
    return join(this.root, `${p.id}-${this.fingerprint(p).slice(0, 16)}`);
  }
  private async acquire() {
    if (!this.lock)
      this.lock = (async () => {
        await mkdir(this.root, { recursive: true, mode: 0o700 });
        const path = join(this.root, "writer.lock");
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            const f = await open(path, "wx", 0o600);
            await f.writeFile(String(process.pid));
            await f.close();
            return;
          } catch (e) {
            if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
            const pid = Number(await readFile(path, "utf8"));
            if (pid === process.pid) return;
            if (!Number.isSafeInteger(pid) || pid <= 0 || alive(pid))
              throw new AppError(
                "CACHE_LOCKED",
                "缓存正由另一服务使用，请使用单实例或独立数据目录。",
              );
            await unlink(path);
          }
        }
        throw new AppError("CACHE_LOCKED", "无法取得缓存写入锁。");
      })().catch((e) => {
        this.lock = undefined;
        throw e;
      });
    await this.lock;
  }
  async snapshot(p: ProjectConfig, id?: string): Promise<Snapshot> {
    const dir = this.directory(p);
    if (id && !snapshotPattern.test(id))
      throw new AppError("INVALID_PARAMETER", "快照参数不合法。", 400);
    let target = id;
    if (!target) {
      try {
        target = (await readFile(join(dir, "current"), "utf8")).trim();
      } catch {
        throw new AppError(
          "NO_SNAPSHOT",
          "还没有成功读取的版本，请读取中心仓库。",
          503,
        );
      }
    }
    if (!snapshotPattern.test(target))
      throw new AppError("CACHE_INVALID", "缓存版本不兼容，请重新读取。");
    try {
      const s = JSON.parse(
        await readFile(join(dir, "snapshots", `${target}.json`), "utf8"),
      ) as Snapshot;
      if (
        ![2, 3].includes(s.cacheSchemaVersion) ||
        s.id !== target ||
        s.projectId !== p.id ||
        s.fingerprint !== this.fingerprint(p)
      )
        throw new Error();
      if (Number(s.cacheSchemaVersion) === 2) {
        s.cacheSchemaVersion = 3;
        s.currentPrototype = {
          revision: null,
          entries: [],
          issues: [],
          message: "请重新读取中心仓库以建立 main 当前清单。",
        };
        s.prototype = {
          status: "invalid",
          branch: "main",
          message: "请重新读取中心仓库以载入 main 原型配置。",
        };
      }
      return s;
    } catch {
      throw new AppError(
        id ? "SNAPSHOT_EXPIRED" : "CACHE_INVALID",
        id
          ? "当前版本已过期，请切换到最新读取版本。"
          : "缓存版本不可读，请重新读取。",
        id ? 410 : 503,
      );
    }
  }
  async summary(p: ProjectConfig): Promise<ProjectSummary> {
    const summary: ProjectSummary = { id: p.id, name: p.name };
    try {
      const s = await this.snapshot(p);
      Object.assign(summary, {
        snapshotId: s.id,
        capturedAt: s.capturedAt,
        defaultBranch: s.defaultBranch,
      });
    } catch {}
    try {
      summary.lastError = (
        JSON.parse(
          await readFile(join(this.directory(p), "last-error.json"), "utf8"),
        ) as { message: string }
      ).message;
    } catch {}
    return summary;
  }
  refresh(p: ProjectConfig, limits: Limits): Promise<Snapshot> {
    const key = this.directory(p),
      existing = this.pending.get(key);
    if (existing) return existing;
    const promise = this.collect(p, limits).finally(() =>
      this.pending.delete(key),
    );
    this.pending.set(key, promise);
    return promise;
  }
  private async collect(p: ProjectConfig, limits: Limits) {
    const dir = this.directory(p);
    try {
      await this.acquire();
      await mkdir(join(dir, "snapshots"), { recursive: true, mode: 0o700 });
      await mkdir(join(dir, "blobs"), { recursive: true, mode: 0o700 });
      const signal = AbortSignal.timeout(limits.refreshMs);
      const reader = this.readerFactory(join(dir, "git"), p);
      const data = await reader.collect(limits, signal);
      const s: Snapshot = {
        cacheSchemaVersion: 3,
        currentPrototype: await readCurrentPrototype(
          reader,
          data.branches.find((b) => b.name === "main")?.commit,
          {
            ...limits,
            totalBytes: Math.max(
              0,
              limits.totalBytes -
                [...data.blobs.values()].reduce((sum, b) => sum + b.length, 0),
            ),
          },
          signal,
        ),
        archiveRefs: data.archiveRefs,
        archivePins: {
          ...(await this.snapshot(p).catch(() => null))?.archivePins,
        },
        prototype: prototypePolicy(data, p),
        id: randomUUID(),
        projectId: p.id,
        fingerprint: this.fingerprint(p),
        capturedAt: new Date().toISOString(),
        defaultBranch: data.defaultBranch,
        branches: data.branches,
        documents: data.documents,
        changes: await indexChanges(data, reader, signal),
        ...indexBase(data, p),
      };
      for (const ref of s.archiveRefs)
        if (!Object.hasOwn(s.archivePins, ref.id))
          s.archivePins[ref.id] = ref.commit;
      for (const [blob, body] of data.blobs) {
        signal.throwIfAborted();
        await atomic(join(dir, "blobs", blob), body);
      }
      signal.throwIfAborted();
      await atomic(join(dir, "snapshots", `${s.id}.json`), JSON.stringify(s));
      await atomic(join(dir, "current"), s.id);
      await unlink(join(dir, "last-error.json")).catch(() => {});
      // Cleanup must never turn a published refresh into a reported failure.
      await this.prune(dir, s.id).catch(() => {});
      return s;
    } catch (e) {
      const error = publicError(e);
      await atomic(
        join(dir, "last-error.json"),
        JSON.stringify({ message: error.message }),
      ).catch(() => {});
      throw error;
    }
  }
  private async prune(dir: string, current: string) {
    const files = (await readdir(join(dir, "snapshots"))).filter(
      (f) => snapshotPattern.test(f.slice(0, -5)) && f.endsWith(".json"),
    );
    const snapshots = await Promise.all(
      files.map(async (f) => ({
        file: f,
        value: JSON.parse(
          await readFile(join(dir, "snapshots", f), "utf8"),
        ) as Snapshot,
      })),
    );
    snapshots.sort(
      (a, b) =>
        Number(b.value.id === current) - Number(a.value.id === current) ||
        b.value.capturedAt.localeCompare(a.value.capturedAt),
    );
    for (const old of snapshots.slice(3))
      await unlink(join(dir, "snapshots", old.file));
    const used = new Set(
      snapshots
        .slice(0, 3)
        .flatMap((s) =>
          s.value.documents.filter((d) => d.readable).map((d) => d.blob),
        ),
    );
    for (const blob of await readdir(join(dir, "blobs")))
      if (/^[a-f0-9]{40,64}$/.test(blob) && !used.has(blob))
        await unlink(join(dir, "blobs", blob));
  }
  async workbench(
    p: ProjectConfig,
    id?: string,
    branch?: string,
  ): Promise<Workbench> {
    const s = await this.snapshot(p, id),
      selectedBranch = branch ?? s.specBranch;
    if (selectedBranch && !s.branches.some((b) => b.name === selectedBranch))
      throw new AppError(
        "BRANCH_NOT_FOUND",
        "该分支不在当前已推送记录中。",
        404,
      );
    return {
      ...s,
      specs: s.specs.filter((v) => v.branch === selectedBranch),
      selectedBranch,
      projectName: p.name,
    };
  }
  async prototypes(p: ProjectConfig, snapshotId?: string) {
    const latest = await this.snapshot(p);
    const source = snapshotId ? await this.snapshot(p, snapshotId) : latest;
    return prototypeCatalog(source, latest.prototype);
  }
  async currentPreview(
    p: ProjectConfig,
    revision: string | undefined,
    limits: Limits,
    snapshotId?: string,
    entry?: string,
    selectedOnly = false,
  ) {
    const latest = await this.snapshot(p);
    const source =
      snapshotId && !revision ? await this.snapshot(p, snapshotId) : latest;
    return resolveCurrentPreview(
      this.readerFactory(join(this.directory(p), "git"), p),
      latest,
      source,
      p,
      revision,
      limits,
      entry,
      selectedOnly,
    );
  }

  async preview(
    p: ProjectConfig,
    change: string,
    revision: string | undefined,
    limits: Limits,
    snapshotId?: string,
    entry?: string,
    selectedOnly = false,
  ) {
    const latest = await this.snapshot(p);
    const source =
      snapshotId && !revision ? await this.snapshot(p, snapshotId) : latest;
    const reader = this.readerFactory(join(this.directory(p), "git"), p);
    return resolvePreview(
      reader,
      latest,
      source,
      change,
      revision,
      limits,
      entry,
      selectedOnly,
      p,
    );
  }
  async document(p: ProjectConfig, id: string, snapshot: string) {
    const s = await this.snapshot(p, snapshot),
      document = s.documents.find((d) => d.id === id);
    if (!document)
      throw new AppError("DOCUMENT_NOT_FOUND", "文档不在当前项目版本中。", 404);
    if (!document.readable)
      throw new AppError(
        "DOCUMENT_UNREADABLE",
        document.diagnostics[0]?.message ?? "该文件格式不支持预览。",
        400,
      );
    const body = await readFile(
      join(this.directory(p), "blobs", document.blob),
    ).catch(() => {
      throw new AppError("CACHE_INVALID", "正文缓存不可读，请重新读取。");
    });
    return { document, body };
  }
  async search(
    p: ProjectConfig,
    snapshot: string,
    branch: string | undefined,
    query: string,
    kind: string,
  ) {
    const s = await this.workbench(p, snapshot, branch),
      q = query.trim().toLocaleLowerCase();
    if (!q || q.length > 200) return [];
    const results: SearchResult[] = [];
    if (kind === "changes")
      for (const group of s.changes) {
        const c = primaryRecord(group);
        if (!c?.state) continue;
        if (`${group.id} ${group.title}`.toLocaleLowerCase().includes(q))
          results.push({
            changeId: group.id,
            title: group.title,
            path: c.directory,
            excerpt: group.id,
            branch: c.branch,
          });
        for (const [taskId, task] of Object.entries(c.state.tasks))
          if (`${taskId} ${task.title}`.toLocaleLowerCase().includes(q))
            results.push({
              changeId: group.id,
              taskId,
              title: `${taskId} · ${task.title}`,
              path: c.directory,
              excerpt: group.title,
              branch: c.branch,
            });
      }
    const refs =
      kind === "specs"
        ? new Set(s.specs.map((x) => x.documentId))
        : new Set(
            s.changes.flatMap((g) =>
              g.candidates
                .filter((c) => c.key === g.primary || !g.primary)
                .flatMap((c) => c.documentIds),
            ),
          );
    for (const d of s.documents.filter(
      (d) =>
        refs.has(d.id) && d.readable && ["markdown", "json"].includes(d.kind),
    )) {
      const body = (await this.document(p, d.id, snapshot)).body.toString(),
        at = body.toLocaleLowerCase().indexOf(q);
      if (at < 0 && !`${d.title} ${d.path}`.toLocaleLowerCase().includes(q))
        continue;
      const change = s.changes.find((g) =>
        g.candidates.some((c) => c.documentIds.includes(d.id)),
      );
      results.push({
        documentId: d.id,
        changeId: change?.id,
        specId: s.specs.find((v) => v.documentId === d.id)?.id,
        title: d.title,
        path: d.path,
        branch: d.branch,
        excerpt: body.slice(Math.max(0, at - 40), Math.max(0, at - 40) + 160),
      });
      if (results.length >= 100) break;
    }
    return results.slice(0, 100);
  }
}
