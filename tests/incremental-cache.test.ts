import test from "node:test";
import assert from "node:assert/strict";
import { readFile, writeFile, rename } from "node:fs/promises";
import { join } from "node:path";
import { fixture } from "./fixture.ts";
import { GitReader } from "../src/server/git.ts";
import { SnapshotStore } from "../src/server/store.ts";
import { DEFAULT_LIMITS, primaryRecord } from "../src/lib/model.ts";

async function traced() {
  const f = await fixture(),
    calls: string[][] = [];
  class Reader extends GitReader {
    override run(args: string[], signal?: AbortSignal, limit?: number) {
      calls.push(args);
      return super.run(args, signal, limit);
    }
  }
  const makeStore = () =>
    new SnapshotStore(
      join(f.root, "cache"),
      (dir) => new Reader(dir, f.remote, "file"),
    );
  await f.put(
    "docs/project/workflow.json",
    JSON.stringify({
      schemaVersion: 1,
      protectedBranches: ["main", "release"],
      prototype: { status: "enabled", packagePath: "packages/prototype" },
    }),
  );
  await f.put(
    "packages/prototype/prototype.json",
    JSON.stringify({
      schemaVersion: 1,
      entries: [],
    }),
  );
  f.commit();
  return {
    ...f,
    calls,
    makeStore,
    store: makeStore(),
    scans: () => calls.filter((a) => a[0] === "ls-tree" && a[1] === "-rz"),
  };
}

test("restart and unchanged refs reuse the complete snapshot; only changed branches scan Changes, with cached main Specs and prototypes", async (t) => {
  const f = await traced();
  t.after(f.cleanup);
  f.git(["checkout", "-b", "change/demo"]);
  await f.put("docs/project/specs/platform/spec.md", "# 未合入能力");
  await f.put("packages/prototype/prototype.json", "{broken");
  await f.put(
    "docs/project/changes/demo/change.json",
    JSON.stringify({
      schemaVersion: 1,
      id: "demo",
      title: "增量分支",
      size: "small",
      status: "active",
      stage: "requirement",
      branch: "change/demo",
      confirmations: {},
      tasks: {},
      closure: {},
    }),
  );
  await f.put(
    "docs/project/changes/demo/requirement.md",
    "[平台](../../specs/platform/spec.md)",
  );
  const firstBranch = f.commit();
  const first = await f.store.refresh(f.project, DEFAULT_LIMITS);
  assert.deepEqual(
    first.specs.map((s) => [s.branch, s.title]),
    [["main", "平台"]],
  );
  assert(
    !first.documents.some(
      (d) => d.branch === "change/demo" && d.path.includes("/specs/"),
    ),
  );
  assert.deepEqual(primaryRecord(first.changes[0])?.relatedSpecs, ["platform"]);
  assert.deepEqual(
    f
      .scans()
      .find((a) => a[3] === firstBranch)
      ?.slice(5),
    ["docs/project/changes/", "docs/project/archive/"],
  );
  f.calls.length = 0;
  const restart = f.makeStore();
  const same = await restart.refresh(f.project, DEFAULT_LIMITS);
  assert.equal(same.id, first.id);
  assert.equal(same.capturedAt, first.capturedAt);
  assert(!f.calls.some((a) => ["ls-tree", "cat-file"].includes(a[0])));

  await f.put(
    "docs/project/changes/demo/requirement.md",
    "# 更新\n[平台](../../specs/platform/spec.md)",
  );
  const changed = f.commit();
  f.calls.length = 0;
  const next = await restart.refresh(f.project, DEFAULT_LIMITS);
  assert.notEqual(next.id, first.id);
  assert.deepEqual(
    f.scans().map((a) => a[3]),
    [changed],
  );
  assert(!f.calls.some((a) => a.includes("packages/prototype/prototype.json")));
  assert.deepEqual(next.currentPrototype, first.currentPrototype);
  f.calls.length = 0;
  const work = await restart.workbench(f.project, undefined, "change/demo");
  assert.equal(work.selectedBranch, "main");
  await restart.document(f.project, work.specs[0].documentId, next.id);
  await restart.prototypes(f.project);
  assert.deepEqual(f.calls, []);

  f.git(["reset", "--hard", firstBranch]);
  f.git(["push", "--force", "origin", "change/demo"]);
  f.calls.length = 0;
  const rewritten = await restart.refresh(f.project, DEFAULT_LIMITS);
  assert.deepEqual(
    f.scans().map((a) => a[3]),
    [firstBranch],
  );
  assert.match(
    (
      await restart.document(
        f.project,
        rewritten.documents.find((d) => d.path.endsWith("demo/requirement.md"))!
          .id,
        rewritten.id,
      )
    ).body.toString(),
    /^\[平台\]/,
  );
  f.git(["push", "origin", "--delete", "change/demo"]);
  f.calls.length = 0;
  const deleted = await restart.refresh(f.project, DEFAULT_LIMITS);
  assert.equal(deleted.changes.length, 0);
  assert.deepEqual(f.scans(), []);
});

test("default branch changes invalidate source scope even at identical commits, and old cache rules rebuild", async (t) => {
  const f = await traced();
  t.after(f.cleanup);
  f.git(["branch", "release"]);
  f.git(["push", "origin", "release"]);
  const first = await f.store.refresh(f.project, DEFAULT_LIMITS);
  f.git(["symbolic-ref", "HEAD", "refs/heads/release"], f.remote);
  f.calls.length = 0;
  const next = await f.store.refresh(f.project, DEFAULT_LIMITS);
  assert.equal(f.scans().length, 2);
  assert.deepEqual(
    next.specs.map((s) => s.branch),
    ["release"],
  );
  assert(
    !next.documents.some(
      (d) => d.branch === "main" && d.path.includes("/specs/"),
    ),
  );
  const path = join(
    f.store.directory(f.project),
    "snapshots",
    next.id + ".json",
  );
  delete next.scanFingerprint;
  await writeFile(path, JSON.stringify(next));
  f.calls.length = 0;
  const upgraded = await f.makeStore().refresh(f.project, DEFAULT_LIMITS);
  assert.notEqual(upgraded.id, next.id);
  assert.equal(f.scans().length, 2);
  await assert.rejects(
    f.store.refresh(f.project, { ...DEFAULT_LIMITS, documents: 1 }),
    { code: "SOURCE_LIMIT" },
  );
  assert.equal((await f.store.snapshot(f.project)).id, upgraded.id);
  assert.notEqual(first.id, upgraded.id);
});

test("automatic refresh shares persisted freshness, manual refresh bypasses it, and failed checks stay retryable", async (t) => {
  const f = await traced();
  t.after(f.cleanup);
  const first = await f.store.refresh(f.project, DEFAULT_LIMITS);
  const context = {
    automatic: true,
    signal: new AbortController().signal,
    beforePublish: async () => {},
  };
  f.calls.length = 0;
  assert.equal(
    (await f.makeStore().refresh(f.project, DEFAULT_LIMITS, context)).id,
    first.id,
  );
  assert.deepEqual(f.calls, []);
  await f.put("docs/project/specs/platform/spec.md", "# 新能力");
  f.commit();
  assert.equal(
    (await f.store.refresh(f.project, DEFAULT_LIMITS, context)).id,
    first.id,
  );
  const next = await f.store.refresh(f.project, DEFAULT_LIMITS);
  assert.equal(next.specs[0].title, "新能力");
  const checked = join(f.store.directory(f.project), "last-checked.json");
  await writeFile(checked, JSON.stringify({ snapshotId: next.id, at: 0 }));
  await rename(f.remote, f.remote + ".offline");
  await assert.rejects(f.store.refresh(f.project, DEFAULT_LIMITS, context), {
    code: "GIT_READ_FAILED",
  });
  assert.equal(JSON.parse(await readFile(checked, "utf8")).at, 0);
  assert.equal((await f.store.snapshot(f.project)).id, next.id);
  await rename(f.remote + ".offline", f.remote);
  assert.equal(
    (await f.store.refresh(f.project, DEFAULT_LIMITS, context)).id,
    next.id,
  );
  assert(JSON.parse(await readFile(checked, "utf8")).at > 0);
});
