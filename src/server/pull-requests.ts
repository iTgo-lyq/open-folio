import "server-only";
import { readFile, stat } from "node:fs/promises";
import { z } from "zod";
import { DEFAULT_LIMITS } from "../lib/model.ts";
import { AppError } from "./errors.ts";
import type { PullRequestPage } from "./providers/types.ts";

export type DeliveryReader = {
  repositoryId: string;
  cacheKey: string;
  list: (
    query: { base?: string; commit?: string },
    cursor: string | null,
    signal: AbortSignal,
    etag?: string,
  ) => Promise<PullRequestPage>;
};
const sha = z.string().regex(/^[a-f0-9]{40,64}$/);
const ref = z.object({
  repositoryId: z.string().min(1).nullable(),
  branch: z.string().min(1).max(255),
  commit: sha,
});
const item = z.object({
  number: z.number().int().positive().safe(),
  title: z.string().max(1000),
  url: z.string().url(),
  state: z.enum(["open", "closed", "merged"]),
  draft: z.boolean(),
  base: ref.extend({ repositoryId: z.string().min(1) }),
  head: ref,
  mergeCommit: sha.nullable(),
  mergedAt: z.string().datetime({ offset: true }).nullable().optional(),
  updatedAt: z.string().datetime({ offset: true }),
});
const cacheSchema = z.object({
  version: z.literal(2),
  key: z.string().nullable(),
  items: z.record(item),
  etag: z.string().max(8192).optional(),
  updatedAt: z.string().datetime({ offset: true }).optional(),
});
export type CatalogItem = z.infer<typeof item>;
type CacheData = z.infer<typeof cacheSchema>;
const queryKey = (reader: DeliveryReader) =>
  JSON.stringify([reader.cacheKey, "all", "updated", "desc", 100, 1]);
const invalid = () =>
  new AppError(
    "PR_CACHE_INVALID",
    "PR 页面缓存不可读或不完整，请检查缓存文件。",
  );
const exceeded = () =>
  new AppError(
    "PR_CACHE_LIMIT",
    "PR 页面缓存超过本次读取大小上限，交付结果待核实。",
  );

/** One repository catalog, keyed by PR number; disk I/O stays outside collection logic. */
export class PullRequestCache {
  private data: CacheData = { version: 2, key: null, items: {} };
  private pending = new Map<string, Promise<CatalogItem[]>>();
  private maxBytes: number;
  constructor(maxBytes = DEFAULT_LIMITS.totalBytes) {
    this.maxBytes = maxBytes;
  }
  static async load(path: string, maxBytes: number) {
    const cache = new PullRequestCache(maxBytes);
    try {
      if ((await stat(path)).size > maxBytes) throw exceeded();
      const bytes = await readFile(path);
      if (bytes.length > maxBytes) throw exceeded();
      cache.data = cacheSchema.parse(JSON.parse(bytes.toString("utf8")));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return cache;
      if (error instanceof AppError) throw error;
      throw invalid();
    }
    return cache;
  }
  serialize() {
    const body = JSON.stringify(this.data);
    if (Buffer.byteLength(body) > this.maxBytes) throw exceeded();
    return body;
  }
  retain(reader: DeliveryReader, _bases: string[]) {
    if (this.data.key !== queryKey(reader))
      this.data = { version: 2, key: null, items: {} };
  }
  async query(reader: DeliveryReader, base: string, signal: AbortSignal) {
    const key = queryKey(reader);
    let result = this.pending.get(key);
    if (!result) {
      result = this.collect(reader, key, signal);
      this.pending.set(key, result);
    }
    return (await result).filter(
      (pr) =>
        pr.base.branch === base &&
        pr.base.repositoryId === reader.repositoryId &&
        pr.head.repositoryId === reader.repositoryId,
    );
  }
  private async collect(
    reader: DeliveryReader,
    key: string,
    signal: AbortSignal,
  ) {
    const old = this.data.key === key ? this.data : undefined;
    const items = { ...old?.items };
    const received: Record<string, CatalogItem> = {};
    let itemBytes = Buffer.byteLength(JSON.stringify(items));
    let itemCount = Object.keys(items).length;
    let etag: string | undefined,
      updatedAt = old?.updatedAt;
    for (let page = 1; ; page++) {
      signal.throwIfAborted();
      const result = await reader.list(
        {},
        page === 1 ? null : String(page),
        signal,
        page === 1 ? old?.etag : undefined,
      );
      signal.throwIfAborted();
      if (result.notModified) {
        if (page !== 1 || !old?.etag) throw invalid();
        return Object.values(old.items);
      }
      if (result.nextCursor != null && result.nextCursor !== String(page + 1))
        throw new AppError(
          "PR_INCOMPLETE",
          "PR 查询分页顺序异常，交付结果待核实。",
        );
      if (page === 1) etag = result.etag;
      if (result.items.length > 100) throw invalid();
      for (const { body: _body, ...pr } of result.items) {
        const parsed = item.safeParse(pr);
        if (!parsed.success)
          throw new AppError("PROVIDER_DATA_INVALID", "PR 页面数据不完整。");
        const id = String(pr.number);
        const previous = items[id];
        if (previous) itemBytes -= Buffer.byteLength(JSON.stringify(previous));
        else {
          itemBytes +=
            Buffer.byteLength(JSON.stringify(id)) + 1 + (itemCount ? 1 : 0);
          itemCount++;
        }
        itemBytes += Buffer.byteLength(JSON.stringify(parsed.data));
        items[id] = parsed.data;
        received[id] = parsed.data;
        if (!updatedAt || Date.parse(pr.updatedAt) > Date.parse(updatedAt))
          updatedAt = pr.updatedAt;
      }
      const next: CacheData = { version: 2, key, items, etag, updatedAt };
      // Count changed entries once instead of serializing the growing catalog on every page.
      const envelopeBytes =
        Buffer.byteLength(JSON.stringify({ ...next, items: {} })) - 2;
      if (itemBytes + envelopeBytes > this.maxBytes) throw exceeded();
      // Updated-order pages include edits/reopens/retargets of old PRs. Equal timestamps
      // continue to the next page, so a timestamp tie cannot hide another update.
      if (
        !result.nextCursor ||
        (old?.updatedAt &&
          result.items.some(
            (pr) => Date.parse(pr.updatedAt) < Date.parse(old.updatedAt!),
          ))
      ) {
        this.data = result.nextCursor ? next : { ...next, items: received };
        return Object.values(this.data.items);
      }
    }
  }
}
