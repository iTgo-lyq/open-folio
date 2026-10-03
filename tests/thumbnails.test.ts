import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readdir, utimes } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createServer } from "node:http";
import { chromium } from "playwright";
import { ThumbnailCache } from "../src/server/thumbnail-cache.ts";
import { renderThumbnail } from "../src/server/thumbnail-renderer.ts";
import { thumbnailResponse } from "../src/server/thumbnails.ts";
import { fixture } from "./fixture.ts";
import { DEFAULT_LIMITS } from "../src/lib/model.ts";
const viewport = { width: 390, height: 844 };
const jpeg = Buffer.from([0xff, 0xd8, ...new Array(58).fill(0)]);
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function temporary(t: import("node:test").TestContext) {
  const root = await mkdtemp(join(tmpdir(), "folio-thumbnails-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

test("thumbnail cache coalesces, persists and keys by source bytes, project and viewport", async (t) => {
  const root = await temporary(t);
  let renders = 0;
  const render = async () => {
    renders++;
    await pause(20);
    return jpeg;
  };
  const cache = new ThumbnailCache(root, render);
  const [first, concurrent] = await Promise.all([
    cache.get("p", "html", viewport),
    cache.get("p", "html", viewport),
  ]);
  assert.equal(renders, 1);
  assert.equal(first.etag, concurrent.etag);
  assert.equal(first.cached, false);
  const restarted = new ThumbnailCache(root, render);
  assert.equal((await restarted.get("p", "html", viewport)).cached, true);
  assert.equal(renders, 1);
  const changed = await cache.get("p", "changed HTML", viewport);
  const resized = await cache.get("p", "html", { width: 1440, height: 900 });
  const isolated = await cache.get("another repository", "html", viewport);
  assert.equal(
    new Set([first, changed, resized, isolated].map((r) => r.etag)).size,
    4,
  );
  assert.equal(renders, 4);
});

test("thumbnail work is bounded, failures recover, and disk quota/age prune derived images", async (t) => {
  const root = await temporary(t);
  let active = 0,
    maximum = 0,
    calls = 0;
  let unblock!: () => void;
  const blocked = new Promise<void>((resolve) => {
    unblock = resolve;
  });
  const cache = new ThumbnailCache(
    root,
    async () => {
      calls++;
      active++;
      maximum = Math.max(maximum, active);
      await blocked;
      active--;
      return jpeg;
    },
    { concurrency: 1, queued: 1, bytes: 100, queueMs: 50 },
  );
  const a = cache.get("p", "first", viewport);
  while (!active) await pause(2);
  const b = cache.get("p", "second", viewport);
  await assert.rejects(b, { code: "THUMBNAIL_BUSY" });
  const c = cache.get("p", "third", viewport);
  await pause(5);
  await assert.rejects(cache.get("p", "fourth", viewport), {
    code: "THUMBNAIL_BUSY",
  });
  unblock();
  await Promise.all([a, c]);
  assert.equal(maximum, 1);
  assert.equal(calls, 2);
  assert.equal(
    (await readdir(root)).filter((p) => p.endsWith(".jpg")).length,
    1,
  );
  const file = (await readdir(root))[0];
  await utimes(join(root, file), new Date(0), new Date(0));
  let attempts = 0;
  const retry = new ThumbnailCache(
    root,
    async () => {
      if (++attempts === 1) throw Error("temporary unavailable");
      return jpeg;
    },
    { failureMs: 25 },
  );
  await assert.rejects(retry.get("p", "retry", viewport));
  await assert.rejects(retry.get("p", "retry", viewport));
  assert.equal(attempts, 1);
  await pause(30);
  await retry.get("p", "retry", viewport);
  assert.equal(attempts, 2);
  assert.equal(
    (await readdir(root)).filter((p) => p.endsWith(".jpg")).length,
    1,
  );
});

test("Chromium renders JS at the real viewport with opaque storage and local hash routing", async (t) => {
  const html = `<!doctype html><html><body style="margin:0"><script>
    let restricted = 0;
    try { localStorage.getItem('secret'); } catch { restricted++; }
    try { document.cookie; } catch { restricted++; }
    try { navigator.serviceWorker; } catch { restricted++; }
    document.body.style.background = restricted === 3 && innerWidth === 390 && typeof process === 'undefined' ? '#00c800' : '#c80000';
    location.hash = '/local';
  </script></body></html>`;
  const body = await renderThumbnail(html, viewport);
  const browser = await chromium.launch({ chromiumSandbox: true });
  t.after(() => browser.close());
  const page = await browser.newPage();
  const pixels = await page.evaluate(async (data) => {
    const img = new Image();
    img.src = `data:image/jpeg;base64,${data}`;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(img, 0, 0);
    return {
      width: img.width,
      height: img.height,
      color: [...ctx.getImageData(10, 10, 1, 1).data],
    };
  }, body.toString("base64"));
  assert.equal(pixels.width, 390);
  assert.equal(pixels.height, 844);
  assert(pixels.color[1] > 190 && pixels.color[0] < 10);
});

test("rendering blocks network and terminates an unresponsive page without poisoning later jobs", async (t) => {
  let hits = 0;
  const server = createServer((_req, res) => {
    hits++;
    res.end("secret");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
  const port = (server.address() as import("node:net").AddressInfo).port;
  await assert.rejects(
    renderThumbnail(
      `<!doctype html><html><body><script>fetch('http://127.0.0.1:${port}/private').catch(()=>{});new WebSocket('ws://127.0.0.1:${port}/socket');</script></body></html>`,
      viewport,
    ),
    { code: "THUMBNAIL_RENDER_FAILED" },
  );
  assert.equal(hits, 0);
  const start = Date.now();
  await assert.rejects(
    renderThumbnail(
      "<!doctype html><html><script>while(true){}</script></html>",
      viewport,
      1500,
    ),
    { code: "THUMBNAIL_TIMEOUT" },
  );
  assert(Date.now() - start < 7000);
  assert(
    (
      await renderThumbnail(
        "<!doctype html><html><body>recovered</body></html>",
        viewport,
      )
    ).length > 100,
  );
});

test("thumbnail responses reuse content across Git commits and recheck policy before cache hits or 304", async (t) => {
  const f = await fixture();
  t.after(f.cleanup);
  const decision = { at: "2026-10-03T12:00:00+08:00", summary: "同意" };
  const workflow = {
    schemaVersion: 1,
    protectedBranches: ["main"],
    prototype: {
      status: "enabled",
      packagePath: "packages/prototype",
      decision,
    },
  };
  await f.put("docs/project/workflow.json", JSON.stringify(workflow));
  f.commit();
  f.git(["checkout", "-b", "change/demo"]);
  const entry = {
    id: "page",
    title: "页面",
    kind: "page",
    path: "packages/prototype/preview/page",
    devices: ["pc-web", "mobile"],
  };
  const state = {
    schemaVersion: 1,
    id: "demo",
    title: "场景",
    branch: "change/demo",
    size: "small",
    status: "active",
    stage: "execution",
    confirmations: {},
    tasks: { T1: { title: "交付", status: "doing" } },
    closure: {},
    previews: [entry],
  };
  await f.put("docs/project/changes/demo/change.json", JSON.stringify(state));
  await f.put(
    `${entry.path}/index.html`,
    "<!doctype html><html><body>first</body></html>",
  );
  f.commit();
  let snapshot = await f.store.refresh(f.project, DEFAULT_LIMITS);
  let renders = 0;
  const cache = new ThumbnailCache(join(f.root, "thumbnails"), async () => {
    renders++;
    return jpeg;
  });
  const response = (query = "", etag?: string) =>
    thumbnailResponse(
      new Request("http://localhost/image?snapshot=" + snapshot.id + query, {
        headers: etag ? { "if-none-match": etag } : {},
      }),
      f.project,
      f.store,
      cache,
      DEFAULT_LIMITS,
      "demo",
      "page",
    );
  const first = await response("&device=mobile");
  assert.equal(first.headers.get("content-type"), "image/jpeg");
  assert.match(first.headers.get("cache-control")!, /private.*must-revalidate/);
  const etag = first.headers.get("etag")!;
  assert.equal((await response("&device=mobile", etag)).status, 304);
  await f.put(
    "docs/project/changes/demo/requirement.md",
    "# Unrelated documentation",
  );
  f.commit();
  snapshot = await f.store.refresh(f.project, DEFAULT_LIMITS);
  assert.equal((await response("&device=mobile")).headers.get("etag"), etag);
  assert.equal(renders, 1);
  await assert.rejects(response("&device=ipad"), { code: "INVALID_PARAMETER" });
  assert.notEqual((await response("&device=pc-web")).headers.get("etag"), etag);
  await f.put(
    `${entry.path}/index.html`,
    "<!doctype html><html><body>second</body></html>",
  );
  f.commit();
  snapshot = await f.store.refresh(f.project, DEFAULT_LIMITS);
  assert.notEqual((await response("&device=mobile")).headers.get("etag"), etag);
  assert.equal(renders, 3);
  let finish!: () => void;
  let started!: () => void;
  const rendering = new Promise<void>((resolve) => {
    started = resolve;
  });
  const unfinished = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const flightCache = new ThumbnailCache(join(f.root, "inflight"), async () => {
    started();
    await unfinished;
    return jpeg;
  });
  const inFlight = thumbnailResponse(
    new Request("http://localhost/image?snapshot=" + snapshot.id),
    f.project,
    f.store,
    flightCache,
    DEFAULT_LIMITS,
    "demo",
    "page",
  );
  await rendering;
  f.git(["checkout", "main"]);
  await f.put(
    "docs/project/workflow.json",
    JSON.stringify({
      ...workflow,
      prototype: { status: "disabled", decision },
    }),
  );
  f.commit();
  await f.store.refresh(f.project, DEFAULT_LIMITS);
  finish();
  await assert.rejects(inFlight, { code: "THUMBNAIL_UNAVAILABLE" });
  await assert.rejects(response("&device=mobile", etag), {
    code: "THUMBNAIL_UNAVAILABLE",
  });
  assert.equal(renders, 3);
});
