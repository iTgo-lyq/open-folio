import test from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { writeFile } from "node:fs/promises";
import { integrationFixture, completedChange } from "./integration-fixture.ts";
import {
  INTEGRATION_VERSION,
  integrationFor,
  inspectIntegration,
} from "../.agents/skills/spec-trail/scripts/integration-records.mjs";
import { SnapshotStore } from "../src/server/store.ts";
import { GitReader } from "../src/server/git.ts";
import { DEFAULT_LIMITS } from "../src/lib/model.ts";

test("diff location does not repeat archive policy checks after merge", async (t) => {
  const f = await integrationFixture();
  t.after(f.cleanup);
  await f.put(
    `${f.archivePath}/change.json`,
    JSON.stringify({
      ...f.record,
      previews: [
        {
          id: "page",
          title: "Shared page",
          kind: "page",
          devices: ["pc-web"],
          artifact: {
            type: "git",
            path: "prototype/preview/page",
            sourceCommit: f.source,
          },
        },
      ],
    }),
  );
  await f.put("prototype/preview/page/index.html", "<html>shared</html>");
  f.commit();
  assert.equal(
    (await inspectIntegration(f.run, f.merge(), f.id)).status,
    "found",
  );
});

test("a forced merge preserves a unique delivery after source deletion and a fresh collaboration-only read", async (t) => {
  const f = await integrationFixture();
  t.after(f.cleanup);
  const merge = f.merge();
  f.git(["push", "origin", "--delete", f.branch]);
  f.git(["branch", "-d", f.branch]);
  const store = new SnapshotStore(
    join(f.root, "fresh-cache"),
    (dir) => new GitReader(dir, f.remote, "file"),
    f.project.id,
  );
  const snapshot = await store.refresh(f.project, DEFAULT_LIMITS, f.context);
  const result = integrationFor(snapshot.integrations, f.id);
  assert.equal(result.status, "found");
  if (result.status !== "found") return;
  assert.equal(result.commit, merge);
  assert.equal(result.base, f.base);
  assert.equal(result.source, f.source);
  assert.equal(result.archivePath, f.archivePath);
  assert.deepEqual(
    snapshot.branches.map((branch) => branch.name),
    ["develop"],
  );
  assert.equal(
    (await store.refresh(f.project, DEFAULT_LIMITS, f.context)).id,
    snapshot.id,
  );
  assert.equal(
    integrationFor(snapshot.integrations, "other").status,
    "missing",
  );
});

test("commit message markers never create or override PR associations", async (t) => {
  const f = await integrationFixture();
  t.after(f.cleanup);
  const merge = f.merge();
  f.git(["checkout", "-b", "noise"]);
  f.git(["commit", "--allow-empty", "-m", "No new delivery"]);
  f.git(["checkout", "develop"]);
  f.git([
    "merge",
    "--no-ff",
    "noise",
    "-m",
    "False association\n\nSpecTrail-Change: example",
  ]);
  f.git(["push", "origin", "develop"]);
  const snapshot = await f.store.refresh(f.project, DEFAULT_LIMITS, f.context);
  const result = integrationFor(snapshot.integrations, f.id);
  assert.equal(result.status, "found");
  if (result.status === "found") assert.equal(result.commit, merge);
  f.pullRequests.length = 0;
  const missing = await f.store.refresh(f.project, DEFAULT_LIMITS, f.context);
  assert.equal(integrationFor(missing.integrations, f.id).status, "missing");
  assert.notEqual(missing.id, snapshot.id);
  assert.deepEqual(missing.branches, snapshot.branches);
});

test("diff location needs merge parents but leaves archive content and introduction policy to CI", async (t) => {
  const f = await integrationFixture();
  t.after(f.cleanup);
  assert.equal(
    (await inspectIntegration(f.run, f.source, f.id)).status,
    "invalid",
  );
  f.merge();
  await f.put(`${f.archivePath}/requirement.md`, "# Changed during merge\n");
  f.git(["add", "."]);
  f.git(["commit", "--amend", "--no-edit"]);
  let result = await inspectIntegration(
    f.run,
    f.git(["rev-parse", "HEAD"]),
    f.id,
  );
  assert.equal(result.status, "found");

  f.git(["checkout", f.branch]);
  const extra = completedChange("extra", f.branch);
  await f.put(
    `${extra.closure.archive.path}/change.json`,
    JSON.stringify(extra),
  );
  f.commit();
  f.git(["checkout", "-b", "candidate", f.base]);
  f.git([
    "merge",
    "--no-ff",
    f.branch,
    "-m",
    "Merge\n\nSpecTrail-Change: example",
  ]);
  result = await inspectIntegration(f.run, f.git(["rev-parse", "HEAD"]), f.id);
  assert.equal(result.status, "found");
});

test("unreadable diff objects retain diagnostics without fabricating a diff", async (t) => {
  const f = await integrationFixture();
  t.after(f.cleanup);
  const merge = f.merge();
  for (const operation of ["log", "ls-tree"]) {
    const result = await inspectIntegration(
      async (args) => {
        if (args[0] === operation) throw Error("Object missing");
        return f.run(args);
      },
      merge,
      f.id,
    );
    assert.equal(result.status, "unavailable");
  }
});

test("prototype-named Change ids use own records and duplicate PRs are ambiguous", async (t) => {
  const f = await integrationFixture("constructor");
  t.after(f.cleanup);
  f.merge();
  const before = await f.store.refresh(f.project, DEFAULT_LIMITS, f.context);
  assert.equal(integrationFor(before.integrations, f.id).status, "found");
  f.pullRequests.push({
    ...f.pullRequests[0],
    number: 2,
    url: "https://github.com/demo/work/pull/2",
  });
  const after = await f.store.refresh(f.project, DEFAULT_LIMITS, f.context);
  assert.equal(integrationFor(after.integrations, f.id).status, "invalid");
  assert.equal(after.deliveryByChange?.[f.id].stage, "unknown");
});

test("a transient candidate read failure is retried even if the collaboration tip is unchanged", async (t) => {
  const f = await integrationFixture();
  t.after(f.cleanup);
  const merge = f.merge();
  let fail = true;
  class Reader extends GitReader {
    override async run(args: string[], signal?: AbortSignal, limit?: number) {
      if (
        fail &&
        args[0] === "ls-tree" &&
        args.includes(merge) &&
        args.includes("docs/project/archive/")
      )
        throw Error("Transient object read failure");
      return super.run(args, signal, limit);
    }
  }
  const store = new SnapshotStore(
    join(f.root, "retry-cache"),
    (dir) => new Reader(dir, f.remote, "file"),
    f.project.id,
  );
  const before = await store.refresh(f.project, DEFAULT_LIMITS, f.context);
  assert.equal(integrationFor(before.integrations, f.id).status, "unavailable");
  fail = false;
  const after = await store.refresh(f.project, DEFAULT_LIMITS, f.context);
  assert.equal(integrationFor(after.integrations, f.id).status, "found");
  assert.notEqual(after.id, before.id);
  assert.deepEqual(after.branches, before.branches);
});

test("PR history finds the original merge after concurrent synchronization and rebuilds an old same-tip index", async (t) => {
  const f = await integrationFixture();
  t.after(f.cleanup);
  const merge = f.merge();
  f.git(["checkout", "-b", "local-planning", f.base]);
  await f.put("planning.txt", "Local discussion\n");
  f.commit(false);
  f.git(["merge", "--no-ff", merge, "-m", "Sync remote develop"]);
  const sync = f.git(["rev-parse", "HEAD"]);
  f.git(["push", "origin", "HEAD:refs/heads/develop"]);
  assert.ok(
    !f.git(["rev-list", "--first-parent", sync]).split("\n").includes(merge),
  );
  const snapshot = await f.store.refresh(f.project, DEFAULT_LIMITS, f.context);
  const record = integrationFor(snapshot.integrations, f.id);
  assert.equal(record.status, "found");
  if (record.status !== "found") return;
  assert.equal(record.commit, merge);
  assert.equal(record.base, f.base);
  const old = structuredClone(snapshot);
  old.integrations = { ...old.integrations, version: 1, records: {} };
  await writeFile(
    join(f.store.directory(), "snapshots", `${old.id}.json`),
    JSON.stringify(old),
  );
  const refreshed = await f.store.refresh(f.project, DEFAULT_LIMITS, {
    ...f.context,
    automatic: true,
  });
  assert.equal(refreshed.integrations.tip, old.integrations.tip);
  assert.equal(refreshed.integrations.version, INTEGRATION_VERSION);
  assert.equal(integrationFor(refreshed.integrations, f.id).status, "found");
  const summary = await (
    await f.store.integration(f.project, f.id, refreshed.id)
  ).summary();
  assert.equal(summary.record.status, "found");
});

test("PR body changes at the same Git tip refresh associations without reusing stale evidence", async (t) => {
  const f = await integrationFixture();
  t.after(f.cleanup);
  f.merge();
  const first = await f.store.refresh(f.project, DEFAULT_LIMITS, f.context);
  const original = f.pullRequests[0].body;
  f.pullRequests[0].body = "PR\n\nSpecTrail-Change: unrelated";
  const second = await f.store.refresh(f.project, DEFAULT_LIMITS, f.context);
  assert.equal(integrationFor(second.integrations, f.id).status, "missing");
  assert.equal(second.deliveryByChange?.example.stage, "pendingIntegration");
  assert.deepEqual(first.branches, second.branches);
  assert.notEqual(first.id, second.id);
  f.pullRequests[0].body = original;
  const third = await f.store.refresh(f.project, DEFAULT_LIMITS, f.context);
  assert.equal(integrationFor(third.integrations, f.id).status, "found");
  const fourth = await f.store.refresh(f.project, DEFAULT_LIMITS, f.context);
  assert.equal(fourth.id, third.id);
});
