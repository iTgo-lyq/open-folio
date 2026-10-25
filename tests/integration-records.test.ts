import test from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { readFile } from "node:fs/promises";
import { integrationFixture, completedChange } from "./integration-fixture.ts";
import {
  scanIntegrations,
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
  const snapshot = await store.refresh(f.project, DEFAULT_LIMITS);
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
    (await store.refresh(f.project, DEFAULT_LIMITS)).id,
    snapshot.id,
  );
  assert.equal(
    integrationFor(snapshot.integrations, "other").status,
    "missing",
  );
});

test("ordinary commit markers and prose do not replace or invalidate the unique merge diff", async (t) => {
  const f = await integrationFixture();
  t.after(f.cleanup);
  f.git([
    "commit",
    "--allow-empty",
    "-m",
    "Side task\n\nSpecTrail-Change: side-task",
  ]);
  f.git(["push", "origin", f.branch]);
  const merge = f.merge();
  assert.equal(
    integrationFor(await scanIntegrations(f.run, merge), "side-task").status,
    "missing",
  );
  f.git([
    "commit",
    "--allow-empty",
    "-m",
    "SpecTrail-Change: example\n\nMention only, without a trailer.",
  ]);
  let index = await scanIntegrations(f.run, f.git(["rev-parse", "HEAD"]));
  assert.equal(integrationFor(index, f.id).status, "found");
  f.git([
    "commit",
    "--allow-empty",
    "-m",
    "Duplicate\n\nSpecTrail-Change: example",
  ]);
  f.git(["push", "origin", "develop"]);
  index = await scanIntegrations(f.run, f.git(["rev-parse", "HEAD"]));
  assert.equal(integrationFor(index, f.id).status, "found");
  const snapshot = await f.store.refresh(f.project, DEFAULT_LIMITS);
  assert.equal(integrationFor(snapshot.integrations, f.id).status, "found");
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

test("failed or shallow history is unavailable, and one unreadable archive does not mask another missing id", async (t) => {
  const f = await integrationFixture();
  t.after(f.cleanup);
  const merge = f.merge();
  const shallow = await scanIntegrations(
    async (args) => (args[0] === "rev-parse" ? "true" : f.run(args)),
    merge,
  );
  assert.equal(integrationFor(shallow, f.id).status, "unavailable");
  const broken = await scanIntegrations(async (args) => {
    if (args[0] === "log") throw Error("missing history");
    return f.run(args);
  }, merge);
  assert.equal(integrationFor(broken, "unknown").status, "unavailable");
  const missingObject = await scanIntegrations(async (args) => {
    if (args[0] === "ls-tree") throw Error("missing object");
    return f.run(args);
  }, merge);
  assert.equal(missingObject.complete, true);
  assert.equal(integrationFor(missingObject, f.id).status, "unavailable");
  assert.equal(integrationFor(missingObject, "unknown").status, "missing");
});

test("duplicate trailers remain ambiguous while archived state is checked by readers and CI", async (t) => {
  const f = await integrationFixture("constructor");
  t.after(f.cleanup);
  f.merge();
  let index = await scanIntegrations(f.run, f.git(["rev-parse", "HEAD"]));
  assert.equal(integrationFor(index, f.id).status, "found");
  f.git([
    "commit",
    "--amend",
    "-m",
    "Merge\n\nSpecTrail-Change: constructor\nSpecTrail-Change: constructor",
  ]);
  index = await scanIntegrations(f.run, f.git(["rev-parse", "HEAD"]));
  assert.equal(integrationFor(index, f.id).status, "invalid");
  f.git(["commit", "--amend", "-m", "Merge\n\nSpecTrail-Change: constructor"]);
  await f.put(
    `${f.archivePath}/change.json`,
    JSON.stringify({ ...f.record, status: "active" }),
  );
  f.git(["add", "."]);
  f.git(["commit", "--amend", "--no-edit"]);
  index = await scanIntegrations(f.run, f.git(["rev-parse", "HEAD"]));
  assert.equal(integrationFor(index, f.id).status, "found");
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
  const before = await store.refresh(f.project, DEFAULT_LIMITS);
  assert.equal(integrationFor(before.integrations, f.id).status, "unavailable");
  fail = false;
  const after = await store.refresh(f.project, DEFAULT_LIMITS);
  assert.equal(integrationFor(after.integrations, f.id).status, "found");
  assert.notEqual(after.id, before.id);
  assert.deepEqual(after.branches, before.branches);
});

test("ordinary Git history finds the original merge after concurrent synchronization and rebuilds an old same-tip index", async (t) => {
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
  const snapshot = await f.store.refresh(f.project, DEFAULT_LIMITS);
  const record = integrationFor(snapshot.integrations, f.id);
  assert.equal(record.status, "found");
  if (record.status !== "found") return;
  assert.equal(record.commit, merge);
  assert.equal(record.base, f.base);
  const old = structuredClone(snapshot);
  old.integrations = { ...old.integrations, version: 1, records: {} };
  const reader = new GitReader(
    join(f.store.directory(), "git"),
    f.remote,
    "file",
  );
  const data = await reader.collect(
    DEFAULT_LIMITS,
    AbortSignal.timeout(DEFAULT_LIMITS.refreshMs),
    "develop",
    {
      snapshot: old,
      readBlob: (blob) => readFile(join(f.store.directory(), "blobs", blob)),
    },
  );
  assert.equal(data.integrations.tip, old.integrations.tip);
  assert.equal(data.integrations.version, 2);
  assert.equal(integrationFor(data.integrations, f.id).status, "found");
  const summary = await (
    await f.store.integration(f.project, f.id, snapshot.id)
  ).summary();
  assert.equal(summary.record.status, "found");
});
