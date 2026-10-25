import "server-only";
import { readFile, stat } from "node:fs/promises";
import { z } from "zod";
import { DEFAULT_LIMITS } from "../lib/model.ts";
import { AppError } from "./errors.ts";
import type { PullRequestPage } from "./providers/types.ts";
import { prMarker } from "../../.agents/skills/spec-trail/scripts/pr-markers.mjs";

export type DeliveryReader = {
  repositoryId: string;
  cacheKey: string;
  list: (
    query: { base: string },
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
const marker = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("change"),
    id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  }),
  z.object({
    kind: z.literal("release"),
    version: z.string().min(1),
    includes: z.array(z.string().min(1)).min(1),
  }),
]);
const item = z.object({
  number: z.number().int().positive().safe(),
  title: z.string().max(1000),
  url: z.string().url(),
  state: z.enum(["open", "closed", "merged"]),
  draft: z.boolean(),
  base: ref.extend({ repositoryId: z.string().min(1) }),
  head: ref,
  mergeCommit: sha.nullable(),
  updatedAt: z.string().datetime({ offset: true }),
  marker,
});
const pageSchema = z.object({
  etag: z.string().min(1).max(8192).optional(),
  rawCount: z.number().int().min(0).max(100),
  hasNext: z.boolean(),
  items: z.array(item).max(100),
});
const more = (page: z.infer<typeof pageSchema>) =>
  page.rawCount === 100 || page.hasNext;
const querySchema = z
  .object({
    key: z.string(),
    pages: z.array(pageSchema).min(1),
  })
  .refine(({ pages }) =>
    pages.every(
      (p, i) =>
        p.items.length <= p.rawCount && more(p) === i < pages.length - 1,
    ),
  );
const cacheSchema = z
  .object({
    version: z.literal(1),
    queries: z.array(querySchema),
  })
  .refine(
    ({ queries }) => new Set(queries.map((q) => q.key)).size === queries.length,
  );
export type CatalogItem = z.infer<typeof item>;
type CacheData = z.infer<typeof cacheSchema>;
const queryKey = (reader: DeliveryReader, base: string) =>
  JSON.stringify([reader.cacheKey, base, "all", "created", "desc", 100]);
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

/** One refresh owns this cache under the source's existing single-flight/write lock. */
export class PullRequestCache {
  private data: CacheData = { version: 1, queries: [] };
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
  retain(reader: DeliveryReader, bases: string[]) {
    const keys = new Set(bases.map((base) => queryKey(reader, base)));
    this.data.queries = this.data.queries.filter((q) => keys.has(q.key));
  }
  query(reader: DeliveryReader, base: string, signal: AbortSignal) {
    const key = queryKey(reader, base);
    let result = this.pending.get(key);
    if (!result) {
      result = this.collect(reader, base, key, signal);
      this.pending.set(key, result);
    }
    return result;
  }
  private async collect(
    reader: DeliveryReader,
    base: string,
    key: string,
    signal: AbortSignal,
  ) {
    const old = this.data.queries.find((q) => q.key === key);
    const pages: z.infer<typeof pageSchema>[] = [];
    // Account for every retained query and every page, including unmarked PRs.
    const others = this.data.queries.filter((q) => q.key !== key);
    let bytes = Buffer.byteLength(
      JSON.stringify({ version: 1, queries: [...others, { key, pages: [] }] }),
    );
    for (let number = 1; ; number++) {
      signal.throwIfAborted();
      const prior = old?.pages[number - 1];
      const result = await reader.list(
        { base },
        number === 1 ? null : String(number),
        signal,
        prior?.etag,
      );
      signal.throwIfAborted();
      if (result.nextCursor != null && result.nextCursor !== String(number + 1))
        throw new AppError(
          "PR_INCOMPLETE",
          "PR 查询分页顺序异常，交付结果待核实。",
        );
      let page: z.infer<typeof pageSchema>;
      if (result.notModified) {
        if (!prior?.etag) throw invalid();
        page = {
          ...prior,
          etag: result.etag ?? prior.etag,
          hasNext:
            result.nextCursor === undefined
              ? prior.hasNext
              : result.nextCursor !== null,
        };
      } else {
        page = {
          etag: result.etag,
          rawCount: result.items.length,
          hasNext: result.nextCursor !== null,
          items: result.items.flatMap(({ body, ...pr }) => {
            const marker = prMarker(body);
            return pr.base.repositoryId === reader.repositoryId &&
              pr.head.repositoryId === reader.repositoryId &&
              pr.base.branch === base &&
              (marker.kind === "change" || marker.kind === "release")
              ? [{ ...pr, marker }]
              : [];
          }),
        };
      }
      const parsed = pageSchema.safeParse(page);
      if (!parsed.success)
        throw new AppError("PROVIDER_DATA_INVALID", "PR 页面数据不完整。");
      page = parsed.data;
      bytes += Buffer.byteLength(JSON.stringify(page)) + (pages.length ? 1 : 0);
      if (bytes > this.maxBytes) throw exceeded();
      pages.push(page);
      // A full cached last page may acquire a new tail even when it returns 304.
      if (!more(page)) break;
    }
    // A failed or cancelled page never replaces a complete prior collection.
    this.data = { version: 1, queries: [...others, { key, pages }] };
    return [
      ...new Map(
        pages.flatMap((p) => p.items).map((p) => [p.number, p]),
      ).values(),
    ];
  }
}
