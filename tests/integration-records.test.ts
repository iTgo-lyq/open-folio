import test from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { integrationFixture, completedChange } from "./integration-fixture.ts";
import {
  scanIntegrations,
  integrationFor,
  inspectIntegration,
} from "../.agents/skills/spec-trail/scripts/integration-records.mjs";
import { SnapshotStore } from "../src/server/store.ts";
import { GitReader } from "../src/server/git.ts";
import { DEFAULT_LIMITS } from "../src/lib/model.ts";

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

test("title/prose mentions and second-parent markers do not associate a delivery; duplicate first-parent markers do", async (t) => {
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
  assert.equal(integrationFor(index, f.id).status, "invalid");
  const snapshot = await f.store.refresh(f.project, DEFAULT_LIMITS);
  assert.equal(integrationFor(snapshot.integrations, f.id).status, "invalid");
});

test("changed archived bytes, invalid parent shape and multiple newly archived Changes are rejected", async (t) => {
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
  assert.equal(result.status, "invalid");
  assert.match(result.message, /修改/);

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
  assert.equal(result.status, "invalid");
  assert.match(result.message, /首次引入/);
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
    if (args[0] === "cat-file") throw Error("missing object");
    return f.run(args);
  }, merge);
  assert.equal(missingObject.complete, true);
  assert.equal(integrationFor(missingObject, f.id).status, "unavailable");
  assert.equal(integrationFor(missingObject, "unknown").status, "missing");
});

test("duplicate trailer fields and invalid archived state diagnose the candidate without relying on branch existence", async (t) => {
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
  assert.equal(integrationFor(index, f.id).status, "invalid");
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
        args[0] === "rev-parse" &&
        args.includes(`${merge}:${f.archivePath}`)
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
