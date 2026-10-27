import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { GitHubProvider } from "../src/server/providers/github.ts";
import { SecretHandle } from "../src/server/providers/types.ts";
import {
  PullRequestCache,
  type DeliveryReader,
} from "../src/server/pull-requests.ts";
import { DEFAULT_LIMITS } from "../src/lib/model.ts";

const signal = new AbortController().signal;
const oid = (s: string) => s.repeat(40);
const raw = (number: number, base = "develop", marked = true) => ({
  number,
  title: `PR ${number}`,
  body: marked ? `Feature\n\nSpecTrail-Change: item-${number}` : "No metadata",
  html_url: `https://github.com/demo/work/pull/${number}`,
  state: "open",
  draft: false,
  base: { ref: base, sha: oid("a"), repo: { id: 12 } },
  head: { ref: `change/item-${number}`, sha: oid("b"), repo: { id: 12 } },
  merged_at: null as string | null,
  merge_commit_sha: null,
  updated_at: "2026-10-24T00:00:00Z",
});
function remote() {
  const collections: Record<string, ReturnType<typeof raw>[]> = {
    develop: [],
    main: [],
  };
  const calls: {
    base: string;
    page: number;
    etag: string | null;
    status: number;
  }[] = [];
  let failPage = 0;
  let withEtag = true;
  const ctx = {
    identity: {
      providerId: "github",
      instanceId: "github.com",
      subjectId: "cache-tests",
      login: "demo",
      displayName: "Demo",
    },
    secret: new SecretHandle("mock-token"),
    signal,
  };
  const repo = {
    providerId: "github",
    instanceId: "github.com",
    repositoryId: "12",
    fullName: "demo/work",
    displayName: "work",
    webUrl: "https://github.com/demo/work",
    cloneUrl: "https://github.com/demo/work.git",
    defaultBranch: "main",
  };
  const provider = new GitHubProvider(async (input, init) => {
    const u = new URL(String(input));
    assert.equal(u.pathname, "/repos/demo/work/pulls");
    assert.equal(u.searchParams.get("sort"), "created");
    assert.equal(u.searchParams.get("state"), "all");
    assert.equal(u.searchParams.get("head"), null);
    const base = u.searchParams.get("base")!;
    const page = Number(u.searchParams.get("page"));
    const etag = new Headers(init?.headers).get("if-none-match");
    const items = collections[base].slice((page - 1) * 100, page * 100);
    const tag = `"${createHash("sha256").update(JSON.stringify(items)).digest("hex")}"`;
    const status =
      base === "develop" && page === failPage
        ? 503
        : withEtag && etag === tag
          ? 304
          : 200;
    calls.push({ base, page, etag, status });
    if (status !== 200) return new Response(null, { status });
    const headers: Record<string, string> = withEtag ? { etag: tag } : {};
    if (page * 100 < collections[base].length)
      headers.link = '<ignored>; rel="next"';
    return Response.json(items, { headers });
  });
  const reader: DeliveryReader = {
    repositoryId: "12",
    cacheKey: JSON.stringify([
      "github",
      "github.com",
      "12",
      repo.fullName,
      provider.pullRequestCacheVersion,
    ]),
    list: (q, c, s, etag) =>
      provider.listPullRequests({ ...ctx, signal: s }, repo, q, c, etag),
  };
  return {
    collections,
    calls,
    reader,
    fail: (page: number) => {
      failPage = page;
    },
    noEtag: () => {
      withEtag = false;
    },
  };
}
async function disk(t: { after: (fn: () => Promise<void>) => void }) {
  const root = await mkdtemp(join(tmpdir(), "folio-pr-cache-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const path = join(root, "pull-requests.json");
  return {
    path,
    save: (cache: PullRequestCache) => writeFile(path, cache.serialize()),
    load: () => PullRequestCache.load(path, DEFAULT_LIMITS.totalBytes),
  };
}

test("one base query is shared; disk pages reuse 304 without bodies and preserve undiscovered markers", async (t) => {
  const d = await disk(t),
    r = remote();
  r.collections.develop = [raw(1), raw(2)];
  r.collections.develop[0].merged_at = "2026-10-23T12:30:00Z";
  const cache = await d.load();
  const results = await Promise.all(
    Array.from({ length: 74 }, () => cache.query(r.reader, "develop", signal)),
  );
  assert.equal(r.calls.length, 1);
  assert.equal(results[0][1].marker.kind, "change");
  assert.equal(results[0][0].mergedAt, "2026-10-23T12:30:00Z");
  await cache.query(r.reader, "main", signal);
  assert.equal(r.calls.length, 2);
  await d.save(cache);
  assert(!String(await readFile(d.path)).includes('"body"'));
  const warm = await d.load();
  assert.deepEqual(await warm.query(r.reader, "develop", signal), results[0]);
  await warm.query(r.reader, "main", signal);
  assert.deepEqual(
    r.calls.map((c) => c.status),
    [200, 200, 304, 304],
  );
});

test("all pages are revalidated beyond ten pages, including old PR edits and removals", async (t) => {
  const d = await disk(t),
    r = remote();
  r.collections.develop = Array.from({ length: 1001 }, (_, i) => raw(1001 - i));
  const first = await d.load();
  assert.equal((await first.query(r.reader, "develop", signal)).length, 1001);
  assert.equal(r.calls.length, 11);
  await d.save(first);
  r.calls.length = 0;
  r.collections.develop[1000].title = "Old PR renamed";
  r.collections.develop[1000].body = "Old PR\n\nSpecTrail-Change: reassociated";
  const second = await d.load();
  const result = await second.query(r.reader, "develop", signal);
  assert.equal(result.at(-1)?.title, "Old PR renamed");
  assert.deepEqual(result.at(-1)?.marker, {
    kind: "change",
    id: "reassociated",
  });
  assert.deepEqual(
    r.calls.map((c) => c.status),
    [...Array(10).fill(304), 200],
  );
  await d.save(second);
  r.collections.develop = [];
  const empty = await d.load();
  assert.deepEqual(await empty.query(r.reader, "develop", signal), []);
  await d.save(empty);
  assert.equal(
    JSON.parse(await readFile(d.path, "utf8")).queries[0].pages.length,
    1,
  );
});

test("old cached PRs remain readable and mapping-version refresh fetches merge time without old ETags", async (t) => {
  const d = await disk(t),
    r = remote();
  r.collections.develop = [raw(1)];
  r.collections.develop[0].merged_at = "2026-10-23T12:30:00Z";
  const oldReader = { ...r.reader, cacheKey: "old-mapping-version" };
  const first = new PullRequestCache();
  await first.query(oldReader, "develop", signal);
  const legacy = JSON.parse(first.serialize());
  delete legacy.queries[0].pages[0].items[0].mergedAt;
  await writeFile(d.path, JSON.stringify(legacy));
  const warm = await d.load();
  warm.retain(r.reader, ["develop"]);
  const result = await warm.query(r.reader, "develop", signal);
  assert.equal(r.calls.at(-1)?.etag, null);
  assert.equal(result[0].mergedAt, "2026-10-23T12:30:00Z");
});

test("raw full pages and 304 without Link still discover a new tail; unmarked and foreign PRs are excluded", async (t) => {
  const d = await disk(t),
    r = remote();
  r.collections.develop = Array.from({ length: 100 }, (_, i) =>
    raw(101 - i, "develop", false),
  );
  r.collections.develop[0].head.repo.id = 99;
  r.collections.develop[0].body = "Feature\n\nSpecTrail-Change: foreign";
  const first = await d.load();
  assert.deepEqual(await first.query(r.reader, "develop", signal), []);
  assert.deepEqual(
    r.calls.map((c) => c.page),
    [1, 2],
  );
  await d.save(first);
  r.calls.length = 0;
  // An old PR changes its target branch: created order appends it after the unchanged full page.
  r.collections.develop.push(raw(1));
  const second = await d.load();
  assert.equal((await second.query(r.reader, "develop", signal))[0].number, 1);
  assert.deepEqual(
    r.calls.map((c) => c.status),
    [304, 200],
  );
});

test("failed second page leaves the complete previous base intact while another base can update", async (t) => {
  const d = await disk(t),
    r = remote();
  r.collections.develop = Array.from({ length: 101 }, (_, i) => raw(101 - i));
  const first = await d.load();
  await first.query(r.reader, "develop", signal);
  await first.query(r.reader, "main", signal);
  await d.save(first);
  const old = JSON.parse(first.serialize()).queries[0];
  r.collections.develop[0].title = "Uncommitted page";
  r.collections.main.push(raw(102, "main"));
  r.fail(2);
  const second = await d.load();
  await assert.rejects(second.query(r.reader, "develop", signal), {
    code: "PROVIDER_UNAVAILABLE",
  });
  // Duplicate failed query also shares its rejection instead of issuing HTTP again.
  const count = r.calls.length;
  await assert.rejects(second.query(r.reader, "develop", signal));
  assert.equal(r.calls.length, count);
  assert.equal((await second.query(r.reader, "main", signal)).length, 1);
  await d.save(second);
  const stored = JSON.parse(await readFile(d.path, "utf8"));
  assert.deepEqual(stored.queries[0], old);
  assert.equal(stored.queries[1].pages[0].items.length, 1);
});

test("corrupt, incomplete and oversized caches fail explicitly; query identity and no-ETag responses remain distinct", async (t) => {
  const d = await disk(t),
    r = remote();
  await writeFile(d.path, "not json");
  await assert.rejects(d.load(), { code: "PR_CACHE_INVALID" });
  await writeFile(
    d.path,
    JSON.stringify({
      version: 1,
      queries: [
        { key: "q", pages: [{ rawCount: 100, hasNext: false, items: [] }] },
      ],
    }),
  );
  await assert.rejects(d.load(), { code: "PR_CACHE_INVALID" });
  const small = new PullRequestCache(150);
  r.collections.develop = [raw(1)];
  await assert.rejects(small.query(r.reader, "develop", signal), {
    code: "PR_CACHE_LIMIT",
  });
  assert.equal(JSON.parse(small.serialize()).queries.length, 0);
  r.noEtag();
  const cache = new PullRequestCache();
  await cache.query(r.reader, "develop", signal);
  await d.save(cache);
  const warm = await d.load();
  await warm.query(r.reader, "develop", signal);
  assert.equal(r.calls.at(-1)?.etag, null);
  const changed = { ...r.reader, cacheKey: "other-source-or-version" };
  warm.retain(changed, ["develop"]);
  await warm.query(changed, "develop", signal);
  assert.equal(r.calls.at(-1)?.etag, null);
  assert.equal(JSON.parse(warm.serialize()).queries.length, 1);
  await assert.rejects(PullRequestCache.load(d.path, 1), {
    code: "PR_CACHE_LIMIT",
  });
});
