import test from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { completedChange, integrationFixture } from "./integration-fixture.ts";
import { DEFAULT_LIMITS } from "../src/lib/model.ts";
import { GitReader } from "../src/server/git.ts";
import { integrationBatch } from "../src/server/integration-batch.ts";

test("a single-parent PR commit does not hide other integration boundaries", async (t) => {
  const f = await integrationFixture();
  t.after(f.cleanup);
  const merge = f.merge();
  // A squash-style delivery adds an archive in a commit with one parent.
  const other = completedChange("other");
  await f.put(
    `${other.closure.archive.path}/change.json`,
    JSON.stringify(other),
  );
  const squash = f.commit();
  const records = await integrationBatch(
    { run: async (args) => Buffer.from(f.git(args)) },
    [merge, squash],
    new AbortController().signal,
  );
  assert.equal(records.get(merge)?.get("example")?.status, "found");
  assert.equal(records.has(squash), false);
});

test("a Git child that exits before reading stdin rejects without crashing the server", async (t) => {
  const f = await integrationFixture();
  t.after(f.cleanup);
  await f.store.refresh(f.project, DEFAULT_LIMITS);
  const reader = new GitReader(
    join(f.store.directory(), "git"),
    f.remote,
    "file",
  );
  // Larger than a pipe buffer, so the write is still pending when Git exits.
  await assert.rejects(
    reader.run(
      ["rev-parse", "--verify", "--quiet", "refs/heads/missing"],
      undefined,
      undefined,
      "0".repeat(4 * 1024 * 1024),
    ),
    (error: { code?: string }) => error.code === "GIT_READ_FAILED",
  );
});
