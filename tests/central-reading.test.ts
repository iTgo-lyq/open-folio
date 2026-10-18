import test from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { fixture } from "./fixture.ts";
import { GitReader } from "../src/server/git.ts";
import { SnapshotStore } from "../src/server/store.ts";
import { DEFAULT_LIMITS, primaryRecord } from "../src/lib/model.ts";
const change = (id: string, branch: string) => ({
  schemaVersion: 1,
  id,
  title: id,
  branch,
  size: "small",
  status: "active",
  stage: "execution",
  confirmations: {},
  tasks: { T1: { title: "Implementation", status: "doing" } },
  closure: {},
});

test("only registered sources are fetched, stale central status is ignored, and each source stays at one commit", async (t) => {
  const f = await fixture();
  t.after(f.cleanup);
  f.git(["checkout", "-b", "change/active"]);
  await f.put(
    "docs/project/changes/active/change.json",
    JSON.stringify(change("active", "change/active")),
  );
  await f.put(
    "docs/project/changes/foreign/secret.md",
    "Must not read inherited unrelated body",
  );
  const first = f.commit();
  await f.register({ active: "change/active" });
  for (let i = 0; i < 40; i++)
    f.git(["update-ref", `refs/heads/unrelated/${i}`, first], f.remote);
  f.git(["tag", "spec-trail/archive-v2/unlisted"]);
  f.git(["push", "origin", "refs/tags/spec-trail/archive-v2/unlisted"]);
  const calls: string[][] = [];
  let changed = false;
  class Reader extends GitReader {
    override async run(args: string[], signal?: AbortSignal, limit?: number) {
      calls.push(args);
      if (!changed && args[0] === "ls-tree" && args.includes(first)) {
        changed = true;
        await f.put(
          "docs/project/changes/active/change.json",
          JSON.stringify({
            ...change("active", "change/active"),
            title: "Next commit",
          }),
        );
        f.commit();
      }
      return super.run(args, signal, limit);
    }
  }
  const store = new SnapshotStore(
    join(f.root, "directed-cache"),
    (dir) => new Reader(dir, f.remote, "file"),
    f.project.id,
  );
  const initial = await store.refresh(f.project, {
    ...DEFAULT_LIMITS,
    branches: 3,
  });
  assert.deepEqual(
    initial.branches.map((b) => b.name),
    ["change/active", "develop", "main"],
  );
  assert.equal(primaryRecord(initial.changes[0])?.state?.stage, "execution");
  assert.equal(primaryRecord(initial.changes[0])?.title, "active");
  assert.equal(primaryRecord(initial.changes[0])?.commit, first);
  assert(!initial.documents.some((d) => d.path.includes("foreign")));
  assert.equal(initial.archiveRefs.length, 0);
  assert(
    !calls
      .filter((a) => ["fetch", "ls-remote"].includes(a[0]))
      .flat()
      .some(
        (a) =>
          a.includes("*") || a.includes("unrelated") || a.includes("unlisted"),
      ),
  );
  const next = await store.refresh(f.project, DEFAULT_LIMITS);
  assert.equal(primaryRecord(next.changes[0])?.title, "Next commit");
});

test("legacy or inconsistent setup never falls back to branch scanning and stale full-scan caches cannot be current", async (t) => {
  const f = await fixture();
  t.after(f.cleanup);
  const initial = await f.store.refresh(f.project, DEFAULT_LIMITS);
  f.git(["checkout", "main"]);
  await f.put(
    "docs/project/workflow.json",
    JSON.stringify({ schemaVersion: 1, protectedBranches: ["main"] }),
  );
  f.commit();
  const legacy = await f.store.refresh(f.project, DEFAULT_LIMITS);
  assert.equal(legacy.specBranch, null);
  assert.equal(legacy.changes.length, 0);
  assert.equal(legacy.branches.length, 1);
  assert(legacy.diagnostics.some((d) => d.code === "SETUP_REQUIRED"));
  await f.put(
    "docs/project/workflow.json",
    JSON.stringify({
      schemaVersion: 2,
      collaborationBranch: "elsewhere",
      protectedBranches: ["main"],
    }),
  );
  f.commit();
  const missing = await f.store.refresh(f.project, DEFAULT_LIMITS);
  assert.equal(missing.specBranch, null);
  assert.match(missing.sourceDiagnostics[0].message, /不存在/);
  assert.notEqual(initial.id, missing.id);
});

test("invalid target identity and duplicate live/archive records remain visible without a stale primary", async (t) => {
  const f = await fixture();
  t.after(f.cleanup);
  f.git(["checkout", "-b", "change/example"]);
  await f.put(
    "docs/project/changes/example/change.json",
    JSON.stringify(change("wrong", "change/example")),
  );
  f.commit();
  await f.register({ example: "change/example" });
  let result = await f.store.refresh(f.project, DEFAULT_LIMITS);
  assert.equal(result.changes.length, 1);
  assert.equal(result.changes[0].primary, null);
  await f.put(
    "docs/project/changes/example/change.json",
    JSON.stringify(change("example", "change/example")),
  );
  await f.put(
    "docs/project/archive/2026-10-18-example/change.json",
    JSON.stringify(change("example", "change/example")),
  );
  f.commit();
  result = await f.store.refresh(f.project, DEFAULT_LIMITS);
  assert.equal(result.changes[0].candidates.length, 2);
  assert.equal(result.changes[0].primary, null);
  assert.match(result.changes[0].diagnostics[0].message, /重复/);
});
