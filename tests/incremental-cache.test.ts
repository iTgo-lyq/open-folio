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
      f.project.id,
    );
  await f.put(
    "docs/project/workflow.json",
    JSON.stringify({
      schemaVersion: 2,
      collaborationBranch: "develop",
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

test("restart and unchanged refs reuse the complete snapshot; only changed branches scan Changes, with cached collaboration Specs and prototypes", async (t) => {
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
  await f.register({ demo: "change/demo" });
  const first = await f.store.refresh(f.project, DEFAULT_LIMITS);
  assert.deepEqual(
    first.specs.map((s) => [s.branch, s.title]),
    [["develop", "平台"]],
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
  assert.equal(f.calls.filter((a) => a[0] === "ls-remote").length, 3);
  assert(!f.calls.some((a) => a[0] === "fetch"));

  await f.put(
    "docs/project/changes/demo/requirement.md",
    "# 更新\n[平台](../../specs/platform/spec.md)",
  );
  const changed = f.commit();
  f.calls.length = 0;
  const next = await restart.refresh(f.project, DEFAULT_LIMITS);
  assert.notEqual(next.id, first.id);
  assert.equal(f.calls.filter((a) => a[0] === "fetch").length, 1);
  assert.deepEqual(
    f.scans().map((a) => a[3]),
    [changed],
  );
  assert(!f.calls.some((a) => a.includes("packages/prototype/prototype.json")));
  assert.deepEqual(next.currentPrototype, first.currentPrototype);
  f.calls.length = 0;
  const work = await restart.workbench(f.project);
  assert.equal(work.selectedBranch, "develop");
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
  assert.equal(deleted.changes.length, 1);
  assert.equal(deleted.changes[0].primary, null);
  assert.match(deleted.changes[0].diagnostics[0].message, /不存在/);
  assert.deepEqual(f.scans(), []);
});

test("default branch changes preserve the configured collaboration scope, and old cache rules rebuild", async (t) => {
  const f = await traced();
  t.after(f.cleanup);
  f.git(["branch", "release"]);
  f.git(["push", "origin", "release"]);
  const first = await f.store.refresh(f.project, DEFAULT_LIMITS);
  f.git(["symbolic-ref", "HEAD", "refs/heads/release"], f.remote);
  f.calls.length = 0;
  const next = await f.store.refresh(f.project, DEFAULT_LIMITS);
  assert.equal(next.id, first.id);
  assert.equal(f.scans().length, 0);
  assert(!f.calls.some((a) => a[0] === "fetch"));
  assert.deepEqual(
    next.specs.map((s) => s.branch),
    ["develop"],
  );
  assert(
    !next.documents.some(
      (d) => d.branch === "main" && d.path.includes("/specs/"),
    ),
  );
  const path = join(f.store.directory(), "snapshots", next.id + ".json");
  delete next.scanFingerprint;
  await writeFile(path, JSON.stringify(next));
  f.calls.length = 0;
  const upgraded = await f.makeStore().refresh(f.project, DEFAULT_LIMITS);
  assert.notEqual(upgraded.id, next.id);
  assert.equal(f.scans().length, 1);
  await assert.rejects(
    f.store.refresh(f.project, { ...DEFAULT_LIMITS, documents: 1 }),
    { code: "SOURCE_LIMIT" },
  );
  assert.equal((await f.store.snapshot(f.project)).id, upgraded.id);
  assert.notEqual(first.id, upgraded.id);
});

test("registered archive refs detect lightweight and annotated archive tag changes, including rewritten tags at the same commit", async (t) => {
  const f = await traced();
  t.after(f.cleanup);
  for (const id of ["light", "annotated"]) {
    const path = `docs/project/archive/2026-10-18-${id}`,
      step = (result: string) => ({
        at: "2026-10-18T00:00:00.000Z",
        result,
        summary: "verified",
      });
    await f.put(
      `${path}/change.json`,
      JSON.stringify({
        schemaVersion: 1,
        id,
        title: id,
        branch: `change/${id}`,
        size: "small",
        status: "completed",
        stage: "close",
        confirmations: {},
        tasks: { T1: { title: "done", status: "done" } },
        closure: {
          verification: step("passed"),
          acceptance: step("accepted"),
          specs: step("synced"),
          archive: { ...step("done"), path },
        },
        previews: [
          {
            id: "view",
            title: "View",
            kind: "page",
            devices: ["pc-web"],
            artifact: {
              type: "git",
              path: "prototype/preview/view",
              sourceCommit: "a".repeat(40),
            },
          },
        ],
      }),
    );
  }
  f.commit();
  const commit = f.git(["rev-parse", "HEAD"]);
  await f.store.refresh(f.project, DEFAULT_LIMITS);
  const light = "refs/tags/spec-trail/archive-v2/light";
  const annotated = "refs/tags/spec-trail/archive-v2/annotated";
  f.git(["tag", "spec-trail/archive-v2/light"]);
  f.git(["tag", "-a", "spec-trail/archive-v2/annotated", "-m", "first"]);
  f.git(["push", "origin", light, annotated]);
  f.calls.length = 0;
  const tagged = await f.store.refresh(f.project, DEFAULT_LIMITS);
  assert.deepEqual(tagged.archiveRefs, [
    { id: "annotated", commit },
    { id: "light", commit },
  ]);
  assert.equal(f.calls.filter((a) => a[0] === "fetch").length, 2);
  f.calls.length = 0;
  assert.equal(
    (await f.store.refresh(f.project, DEFAULT_LIMITS)).id,
    tagged.id,
  );
  assert(!f.calls.some((a) => a[0] === "fetch"));
  f.git(["tag", "-fa", "spec-trail/archive-v2/annotated", "-m", "rewritten"]);
  f.git(["push", "--force", "origin", annotated]);
  f.calls.length = 0;
  assert.equal(
    (await f.store.refresh(f.project, DEFAULT_LIMITS)).id,
    tagged.id,
  );
  assert.equal(f.calls.filter((a) => a[0] === "fetch").length, 1);
  f.calls.length = 0;
  await f.store.refresh(f.project, DEFAULT_LIMITS);
  assert(!f.calls.some((a) => a[0] === "fetch"));
  f.git(["push", "origin", `:${light}`, `:${annotated}`]);
  assert.deepEqual(
    (await f.store.refresh(f.project, DEFAULT_LIMITS)).archiveRefs,
    [],
  );
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
  const checked = join(f.store.directory(), "last-checked.json");
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
