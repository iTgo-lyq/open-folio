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
  updated_at: new Date(
    Date.parse("2026-10-24T00:00:00Z") + number * 1000,
  ).toISOString(),
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
    assert.equal(u.searchParams.get("sort"), "updated");
    assert.equal(u.searchParams.get("state"), "all");
    assert.equal(u.searchParams.get("head"), null);
    const base = u.searchParams.get("base") ?? "all";
    const rows = Object.values(collections)
      .flat()
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
    const page = Number(u.searchParams.get("page"));
    const etag = new Headers(init?.headers).get("if-none-match");
    const items = rows.slice((page - 1) * 100, page * 100);
    const tag = `"${createHash("sha256").update(JSON.stringify(items)).digest("hex")}"`;
    const status =
      page === failPage ? 503 : withEtag && etag === tag ? 304 : 200;
    calls.push({ base, page, etag, status });
    if (status !== 200) return new Response(null, { status });
    const headers: Record<string, string> = withEtag ? { etag: tag } : {};
    if (page * 100 < rows.length) headers.link = '<ignored>; rel="next"';
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

test("one repository query serves every base and persists a body-free flat catalog", async (t) => {
  const d = await disk(t),
    r = remote();
  r.collections.develop = [raw(1), raw(2)];
  r.collections.main = [raw(3, "main", false)];
  const cache = await d.load();
  const [develop, main] = await Promise.all([
    cache.query(r.reader, "develop", signal),
    cache.query(r.reader, "main", signal),
  ]);
  assert.equal(develop.length, 2);
  assert.equal(main.length, 1);
  assert.equal(r.calls.length, 1);
  await d.save(cache);
  const text = await readFile(d.path, "utf8");
  assert(!text.includes('"body"'));
  assert(!text.includes('"marker"'));
  assert.deepEqual(Object.keys(JSON.parse(text).items), ["1", "2", "3"]);
  const warm = await d.load();
  assert.deepEqual(await warm.query(r.reader, "develop", signal), develop);
  assert.equal(r.calls.at(-1)?.status, 304);
});

test("cold pagination reads all PRs; unchanged history uses only the first-page conditional request", async (t) => {
  const d = await disk(t),
    r = remote();
  r.collections.develop = Array.from({ length: 1001 }, (_, i) => raw(i + 1));
  const cold = await d.load();
  assert.equal((await cold.query(r.reader, "develop", signal)).length, 1001);
  assert.equal(r.calls.length, 11);
  await d.save(cold);
  r.calls.length = 0;
  const warm = await d.load();
  assert.equal((await warm.query(r.reader, "develop", signal)).length, 1001);
  assert.equal(r.calls.length, 1);
  assert.equal(r.calls[0].status, 304);
});

test("updated-order incremental pages handle old PR edits, closing, reopening and retargeting", async (t) => {
  const d = await disk(t),
    r = remote();
  r.collections.develop = Array.from({ length: 1001 }, (_, i) => raw(i + 1));
  const cold = await d.load();
  await cold.query(r.reader, "develop", signal);
  await d.save(cold);
  const old = r.collections.develop[0];
  old.title = "Old edited";
  old.state = "closed";
  old.base.ref = "main";
  old.updated_at = "2026-10-25T00:00:00Z";
  r.calls.length = 0;
  const updated = await d.load();
  assert.equal((await updated.query(r.reader, "develop", signal)).length, 1000);
  assert.equal(
    (await updated.query(r.reader, "main", signal))[0].title,
    "Old edited",
  );
  assert.equal(r.calls.length, 1);
  await d.save(updated);
  old.state = "open";
  old.updated_at = "2026-10-26T00:00:00Z";
  const reopened = await d.load();
  assert.equal(
    (await reopened.query(r.reader, "main", signal))[0].state,
    "open",
  );
});

test("timestamp ties continue pagination and failed updates preserve the complete catalog", async (t) => {
  const d = await disk(t),
    r = remote();
  r.collections.develop = Array.from({ length: 101 }, (_, i) => raw(i + 1));
  const cold = await d.load();
  await cold.query(r.reader, "develop", signal);
  await d.save(cold);
  const previous = cold.serialize();
  for (const row of r.collections.develop)
    row.updated_at = "2026-10-26T00:00:00Z";
  r.fail(2);
  const failed = await d.load();
  await assert.rejects(failed.query(r.reader, "develop", signal), {
    code: "PROVIDER_UNAVAILABLE",
  });
  const calls = r.calls.length;
  await assert.rejects(failed.query(r.reader, "main", signal));
  assert.equal(r.calls.length, calls);
  assert.equal(failed.serialize(), previous);
  r.fail(0);
  const retried = await d.load();
  assert.equal((await retried.query(r.reader, "develop", signal)).length, 101);
  await d.save(retried);
  r.noEtag();
  r.calls.length = 0;
  const tied = await d.load();
  await tied.query(r.reader, "develop", signal);
  assert.equal(r.calls.length, 2);
});

test("repository and source identity boundaries exclude foreign PRs and invalidate prior data", async (t) => {
  const d = await disk(t),
    r = remote();
  r.collections.develop = [raw(1), raw(2)];
  r.collections.develop[0].head.repo.id = 99;
  const cache = await d.load();
  assert.equal((await cache.query(r.reader, "develop", signal)).length, 1);
  await d.save(cache);
  const warm = await d.load();
  const changed = { ...r.reader, cacheKey: "new-identity" };
  warm.retain(changed, ["develop"]);
  await warm.query(changed, "develop", signal);
  assert.equal(r.calls.at(-1)?.etag, null);
});

test("invalid, legacy and oversized caches fail explicitly without committing partial records", async (t) => {
  const d = await disk(t),
    r = remote();
  await writeFile(d.path, "not json");
  await assert.rejects(d.load(), { code: "PR_CACHE_INVALID" });
  await writeFile(d.path, JSON.stringify({ version: 1, queries: [] }));
  await assert.rejects(d.load(), { code: "PR_CACHE_INVALID" });
  r.collections.develop = [raw(1)];
  const small = new PullRequestCache(150);
  await assert.rejects(small.query(r.reader, "develop", signal), {
    code: "PR_CACHE_LIMIT",
  });
  assert.deepEqual(JSON.parse(small.serialize()).items, {});
  const normal = new PullRequestCache();
  await normal.query(r.reader, "develop", signal);
  await d.save(normal);
  await assert.rejects(PullRequestCache.load(d.path, 1), {
    code: "PR_CACHE_LIMIT",
  });
});
