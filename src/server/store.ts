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
import { AUTO_REFRESH_MS } from "../lib/model.ts";
import type {
  Limits,
  ProjectConfig,
  ProjectSummary,
  Snapshot,
  Workbench,
} from "../lib/model.ts";
import { GitReader, hash, scanFingerprint } from "./git.ts";
import { indexChanges } from "./changes.ts";
import { indexBase } from "./indexer.ts";
import { AppError, publicError } from "./errors.ts";
import { prototypePolicy, resolvePreview } from "./previews.ts";
import { IntegrationReader } from "./integration.ts";
import {
  prototypeCatalog,
  readCurrentPrototype,
  resolveCurrentPreview,
} from "./prototypes.ts";

const snapshotPattern = /^[a-f0-9-]{36}$/;
type RefreshContext = {
  signal: AbortSignal;
  beforePublish: () => Promise<void>;
  automatic?: boolean;
};
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
  private cacheIdentity: string;
  constructor(
    root: string,
    readerFactory: (directory: string, p: ProjectConfig) => GitReader,
    cacheIdentity: string,
  ) {
    this.root = root;
    this.readerFactory = readerFactory;
    this.cacheIdentity = cacheIdentity;
  }
  fingerprint() {
    return hash(JSON.stringify([4, this.cacheIdentity]));
  }
  directory() {
    return join(this.root, this.cacheIdentity);
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
    const dir = this.directory();
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
        s.cacheSchemaVersion !== 6 ||
        !s.integrations ||
        s.collaborationBranch !== p.collaborationBranch ||
        !Array.isArray(s.routes) ||
        !Array.isArray(s.sourceDiagnostics) ||
        s.id !== target ||
        s.projectId !== p.id ||
        s.fingerprint !== this.fingerprint()
      )
        throw new Error();
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
        collaborationBranch: s.collaborationBranch,
      });
    } catch {}
    try {
      summary.lastError = (
        JSON.parse(
          await readFile(join(this.directory(), "last-error.json"), "utf8"),
        ) as { message: string }
      ).message;
    } catch {}
    return summary;
  }
  refresh(
    p: ProjectConfig,
    limits: Limits,
    context?: RefreshContext,
  ): Promise<Snapshot> {
    const key = this.directory(),
      existing = this.pending.get(key);
    if (existing) return existing;
    const promise = this.collect(p, limits, context).finally(() =>
      this.pending.delete(key),
    );
    this.pending.set(key, promise);
    return promise;
  }
  private async collect(
    p: ProjectConfig,
    limits: Limits,
    context?: RefreshContext,
  ) {
    const dir = this.directory();
    try {
      await this.acquire();
      const previous = await this.snapshot(p).catch(() => undefined);
      const checked = await readFile(join(dir, "last-checked.json"), "utf8")
        .then((body) => JSON.parse(body) as { snapshotId: string; at: number })
        .catch(() => undefined);
      if (
        context?.automatic &&
        previous &&
        previous.scanFingerprint === scanFingerprint(limits) &&
        checked?.snapshotId === previous.id &&
        Date.now() - checked.at >= 0 &&
        Date.now() - checked.at < AUTO_REFRESH_MS
      )
        return previous;
      await mkdir(join(dir, "snapshots"), { recursive: true, mode: 0o700 });
      await mkdir(join(dir, "blobs"), { recursive: true, mode: 0o700 });
      const signal = AbortSignal.any([
        AbortSignal.timeout(limits.refreshMs),
        ...(context ? [context.signal] : []),
      ]);
      const reader = this.readerFactory(join(dir, "git"), p);
      const persisted = new Set<string>();
      const data = await reader.collect(
        limits,
        signal,
        p.collaborationBranch,
        previous
          ? {
              snapshot: previous,
              readBlob: async (blob) => {
                const body = await readFile(join(dir, "blobs", blob));
                persisted.add(blob);
                return body;
              },
            }
          : undefined,
      );
      const markChecked = (id: string) =>
        atomic(
          join(dir, "last-checked.json"),
          JSON.stringify({ snapshotId: id, at: Date.now() }),
        );
      if (data.unchanged && previous) {
        // The live Git check reused an already authorized snapshot. Only a new
        // snapshot needs the extra remote permission check before publication.
        signal.throwIfAborted();
        await markChecked(previous.id);
        await unlink(join(dir, "last-error.json")).catch(() => {});
        return previous;
      }
      const base = indexBase(data, p);
      const main = data.branches.find(
        (b) => b.name === data.collaborationBranch,
      )?.commit;
      const prototypeLimits = {
        ...limits,
        totalBytes: Math.max(
          0,
          limits.totalBytes -
            [...data.blobs.values()].reduce((sum, b) => sum + b.length, 0),
        ),
      };
      const s: Snapshot = {
        cacheSchemaVersion: 6,
        integrations: data.integrations,
        collaborationBranch: data.collaborationBranch,
        routes: data.routes,
        sourceDiagnostics: data.sourceDiagnostics,
        scanFingerprint: scanFingerprint(limits),
        currentPrototype:
          previous?.scanFingerprint === scanFingerprint(limits) &&
          previous.collaborationBranch === data.collaborationBranch &&
          previous.currentPrototype.revision === main &&
          !previous.currentPrototype.message &&
          (previous.currentPrototype.manifestBytes ?? 0) <=
            prototypeLimits.totalBytes
            ? previous.currentPrototype
            : !base.specBranch
              ? {
                  revision: main ?? null,
                  entries: [],
                  issues: [],
                  message:
                    "协作分支来源尚未就绪，请完成 Setup 后读取当前页面。",
                }
              : await readCurrentPrototype(
                  reader,
                  main,
                  prototypeLimits,
                  signal,
                ),
        prototype: prototypePolicy(data),
        id: randomUUID(),
        projectId: p.id,
        fingerprint: this.fingerprint(),
        capturedAt: new Date().toISOString(),
        branches: data.branches,
        documents: data.documents,
        changes: await indexChanges(data, reader, signal),
        ...base,
      };
      for (const [blob, body] of data.blobs) {
        signal.throwIfAborted();
        if (!persisted.has(blob)) await atomic(join(dir, "blobs", blob), body);
      }
      signal.throwIfAborted();
      await context?.beforePublish();
      signal.throwIfAborted();
      await atomic(join(dir, "snapshots", `${s.id}.json`), JSON.stringify(s));
      await atomic(join(dir, "current"), s.id);
      await markChecked(s.id).catch(() => {});
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
    const snapshots: { file: string; value: Snapshot }[] = [];
    for (const file of files) {
      let value: Snapshot | undefined;
      try {
        value = JSON.parse(
          await readFile(join(dir, "snapshots", file), "utf8"),
        ) as Snapshot;
      } catch {}
      if (
        !value ||
        value.cacheSchemaVersion !== 6 ||
        !value.integrations ||
        Object.hasOwn(value, "archiveRefs") ||
        Object.hasOwn(value, "archivePins")
      ) {
        if (file !== `${current}.json`)
          await unlink(join(dir, "snapshots", file));
        continue;
      }
      snapshots.push({ file, value });
    }
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
  async workbench(p: ProjectConfig, id?: string): Promise<Workbench> {
    const s = await this.snapshot(p, id),
      selectedBranch = s.specBranch;
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
  async integration(p: ProjectConfig, id: string, snapshotId: string) {
    return new IntegrationReader(
      this.readerFactory(join(this.directory(), "git"), p),
      await this.snapshot(p, snapshotId),
      id,
    );
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
      this.readerFactory(join(this.directory(), "git"), p),
      latest,
      source,
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
    const reader = this.readerFactory(join(this.directory(), "git"), p);
    return resolvePreview(
      reader,
      latest,
      source,
      change,
      revision,
      limits,
      entry,
      selectedOnly,
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
      join(this.directory(), "blobs", document.blob),
    ).catch(() => {
      throw new AppError("CACHE_INVALID", "正文缓存不可读，请重新读取。");
    });
    return { document, body };
  }
}
