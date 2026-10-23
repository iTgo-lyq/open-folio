import test from "node:test";
import assert from "node:assert/strict";
import { ReadingCache } from "../src/components/reading-cache.ts";
import type { DocumentRef } from "../src/lib/model.ts";

test("reading cache evicts least recently used entries and bounds bytes", () => {
  const cache = new ReadingCache(2, 100);
  cache.set("a", "one");
  cache.set("b", "two");
  assert.equal(cache.get("a"), "one");
  cache.set("c", "three");
  assert.equal(cache.get("b"), undefined);
  cache.set("a", "x".repeat(60));
  assert.equal(cache.get("a"), undefined);
  cache.set("d", "x".repeat(35));
  cache.set("e", "y".repeat(35));
  assert.equal(cache.get("d"), undefined);
  cache.clear();
  assert.equal(cache.get("e"), undefined);
});

test("a late body cannot repopulate cleared credentials and an unchanged blob reuses bytes with current metadata", async (t) => {
  const cache = new ReadingCache();
  const doc = {
    id: "document",
    blob: "blob1",
    commit: "commit1",
  } as DocumentRef;
  let release!: () => void;
  const held = new Promise<void>((r) => {
    release = r;
  });
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    calls++;
    await held;
    return Response.json({ document: doc, body: "# content" });
  });
  const url = (path: string) =>
    `/api/repositories/repo/${path}?connectionId=one`;
  const pending = cache.readDocument(
    doc,
    "snapshot1",
    url,
    new AbortController().signal,
  );
  cache.clear();
  release();
  await assert.rejects(pending, { name: "AbortError" });
  assert.equal(cache.document(doc, url), undefined);
  await cache.readDocument(doc, "snapshot1", url, new AbortController().signal);
  const current = { ...doc, commit: "commit2" };
  const value = await cache.readDocument(
    current,
    "snapshot2",
    url,
    new AbortController().signal,
  );
  assert.equal(calls, 2);
  assert.equal(value.body, "# content");
  assert.equal(value.document.commit, "commit2");
  assert.equal(
    cache.document(doc, (p) => `/other/${p}`),
    undefined,
  );
});

test("snapshot preparation follows readers that change while another body is pending", async (t) => {
  const cache = new ReadingCache();
  const url = (path: string) => `/repo/${path}`;
  const a = {
    id: "a",
    blob: "new-a",
    readable: true,
    kind: "markdown",
  } as DocumentRef;
  const b = { ...a, id: "b", blob: "new-b" } as DocumentRef;
  const releases = new Map<string, () => void>();
  t.mock.method(globalThis, "fetch", async (path: string) => {
    const id = path.includes("documents/a?") ? "a" : "b";
    await new Promise<void>((resolve) => releases.set(id, resolve));
    return Response.json({ body: id });
  });
  const stopA = cache.watch("a", url);
  let finished = false;
  const pending = cache
    .prepare(
      {
        id: "next",
        documents: [a, b],
      } as import("../src/lib/model.ts").Workbench,
      url,
      new AbortController().signal,
    )
    .then(() => {
      finished = true;
    });
  await new Promise((resolve) => setImmediate(resolve));
  stopA();
  const stopB = cache.watch("b", url);
  releases.get("a")!();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(finished, false);
  assert.ok(releases.has("b"));
  releases.get("b")!();
  await pending;
  assert.equal(cache.document(b, url)?.body, "b");
  stopB();
});
