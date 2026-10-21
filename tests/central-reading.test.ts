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
    ["change/active", "develop"],
  );
  assert.equal(primaryRecord(initial.changes[0])?.state?.stage, "execution");
  assert.equal(primaryRecord(initial.changes[0])?.title, "active");
  assert.equal(primaryRecord(initial.changes[0])?.commit, first);
  assert(!initial.documents.some((d) => d.path.includes("foreign")));
  assert.equal(Object.hasOwn(initial, "archiveRefs"), false);
  assert(
    !calls
      .filter((a) => ["fetch", "ls-remote"].includes(a[0]))
      .flat()
      .some(
        (a) =>
          a.includes("*") ||
          a.includes("unrelated") ||
          a.includes("unlisted") ||
          a === "HEAD",
      ),
  );
  const next = await store.refresh(f.project, DEFAULT_LIMITS);
  assert.equal(primaryRecord(next.changes[0])?.title, "Next commit");
});

test("legacy or inconsistent setup never falls back to branch scanning and stale full-scan caches cannot be current", async (t) => {
  const f = await fixture();
  t.after(f.cleanup);
  const initial = await f.store.refresh(f.project, DEFAULT_LIMITS);
  f.git(["checkout", "develop"]);
  await f.put(
    "docs/project/workflow.json",
    JSON.stringify({ schemaVersion: 1, releaseBranch: "main" }),
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
      schemaVersion: 3,
      integrationBranch: "elsewhere",
      releaseBranch: "main",
    }),
  );
  f.commit();
  const missing = await f.store.refresh(f.project, DEFAULT_LIMITS);
  assert.equal(missing.specBranch, null);
  assert.match(missing.sourceDiagnostics[0].message, /不一致/);
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

test("handed-off central prose consumes no document or body budget", async (t) => {
  const f = await fixture();
  t.after(f.cleanup);
  await f.put(
    "docs/project/changes/example/requirement.md",
    "# Stale\n" + "x".repeat(90000),
  );
  f.commit();
  f.git(["checkout", "-b", "change/example"]);
  await f.put(
    "docs/project/changes/example/change.json",
    JSON.stringify(change("example", "change/example")),
  );
  await f.put("docs/project/changes/example/requirement.md", "# Current");
  f.commit();
  await f.register({ example: "change/example" });
  const limits = { ...DEFAULT_LIMITS, documents: 6, totalBytes: 2000 };
  const result = await f.store.refresh(f.project, limits);
  assert.equal(result.documents.length, 5);
  assert(
    !result.documents.some(
      (d) =>
        d.branch === "develop" && d.path.endsWith("example/requirement.md"),
    ),
  );
  assert.equal(primaryRecord(result.changes[0])?.state?.stage, "execution");
  assert.equal((await f.store.refresh(f.project, limits)).id, result.id);
});

test("entry retarget during collection retries the catalog without publishing the former owner's later state", async (t) => {
  const f = await fixture();
  t.after(f.cleanup);
  f.git(["checkout", "-b", "change/old"]);
  await f.put(
    "docs/project/changes/example/change.json",
    JSON.stringify(change("example", "change/old")),
  );
  f.commit();
  f.git(["checkout", "-b", "change/new"]);
  await f.put(
    "docs/project/changes/example/change.json",
    JSON.stringify({ ...change("example", "change/new"), title: "New owner" }),
  );
  f.commit();
  await f.register({ example: "change/old" });
  let changed = false;
  class Reader extends GitReader {
    override async run(args: string[], signal?: AbortSignal, limit?: number) {
      if (
        !changed &&
        args[0] === "ls-remote" &&
        args.includes("refs/heads/change/old")
      ) {
        changed = true;
        await f.register({ example: "change/new" });
        f.git(["checkout", "change/old"]);
        await f.put(
          "docs/project/changes/example/change.json",
          JSON.stringify({
            ...change("example", "change/old"),
            title: "After losing ownership",
          }),
        );
        f.commit();
      }
      return super.run(args, signal, limit);
    }
  }
  const store = new SnapshotStore(
    join(f.root, "retarget-cache"),
    (dir) => new Reader(dir, f.remote, "file"),
    f.project.id,
  );
  const snapshot = await store.refresh(f.project, DEFAULT_LIMITS);
  assert.equal(snapshot.routes[0].branch, "change/new");
  assert.equal(primaryRecord(snapshot.changes[0])?.title, "New owner");
});

test("custom collaboration source works without default or protected refs and rejects a missing or mismatched source", async (t) => {
  const f = await fixture();
  t.after(f.cleanup);
  const branch = "integration/team-a";
  f.git(["checkout", "-b", branch]);
  await f.put(
    "docs/project/workflow.json",
    JSON.stringify({
      schemaVersion: 3,
      integrationBranch: branch,
      releaseBranch: "never-published",
    }),
  );
  await f.put("docs/project/specs/platform/spec.md", "# Custom integration\n");
  f.commit();
  f.git(["symbolic-ref", "HEAD", "refs/heads/absent-default"], f.remote);
  f.git(["push", "origin", "--delete", "main"]);
  const project = { ...f.project, integrationBranch: branch };
  const result = await f.store.refresh(project, DEFAULT_LIMITS);
  assert.equal(result.specBranch, branch);
  assert.equal(result.specs[0].title, "Custom integration");
  assert.deepEqual(
    result.branches.map((b) => b.name),
    [branch],
  );
  assert.deepEqual(result.releaseBranch, "never-published");
  const missing = await f.store.refresh(
    { ...project, integrationBranch: "missing" },
    DEFAULT_LIMITS,
  );
  assert.equal(missing.specBranch, null);
  assert.equal(missing.documents.length, 0);
  assert.match(missing.sourceDiagnostics[0].message, /不存在/);
  await f.put(
    "docs/project/workflow.json",
    JSON.stringify({
      schemaVersion: 3,
      integrationBranch: "somewhere-else",
      releaseBranch: "never-published",
    }),
  );
  f.commit();
  const mismatch = await f.store.refresh(project, DEFAULT_LIMITS);
  assert.equal(mismatch.specBranch, null);
  assert.match(mismatch.sourceDiagnostics[0].message, /不一致/);
});

test("release tip changes refresh metadata without reading release workflow as the central source", async (t) => {
  const f = await fixture();
  t.after(f.cleanup);
  const first = await f.store.refresh(f.project, DEFAULT_LIMITS);
  f.git(["checkout", "main"]);
  await f.put(
    "docs/project/workflow.json",
    JSON.stringify({ schemaVersion: 1, releaseBranch: "main" }),
  );
  f.commit();
  const next = await f.store.refresh(f.project, DEFAULT_LIMITS);
  assert.notEqual(next.id, first.id);
  assert.deepEqual(next.documents, first.documents);
  assert.notEqual(next.releaseSource?.commit, first.releaseSource?.commit);
  assert.equal(next.specBranch, "develop");
});
