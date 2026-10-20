import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { rename } from "node:fs/promises";
import { join } from "node:path";
import { fixture } from "./fixture.ts";
import { DEFAULT_LIMITS, type ChangeGroup } from "../src/lib/model.ts";
import { compareChangeCreation } from "../src/server/changes.ts";

const record = (id: string) =>
  JSON.stringify({
    schemaVersion: 1,
    id,
    title: id,
    branch: "develop",
    size: "small",
    status: "active",
    stage: "requirement",
    confirmations: {},
    tasks: {},
    closure: {},
  });

test("creation ordering puts newest first, breaks ties by ID and leaves unknown last", () => {
  const group = (id: string, createdAt?: string) =>
    ({ id, createdAt }) as ChangeGroup;
  const groups = [
    group("unknown"),
    group("old", "2020-01-01T00:00:00Z"),
    group("z-new", "2025-01-01T00:00:00Z"),
    group("a-new", "2025-01-01T00:00:00Z"),
  ];
  assert.deepEqual(
    groups.sort(compareChangeCreation).map((g) => g.id),
    ["a-new", "z-new", "old", "unknown"],
  );
});

test("snapshot traces first Git addition through edits, merge introductions, archives and warm refresh", async () => {
  const f = await fixture();
  try {
    const commit = (date: string) => {
      f.git(["add", "."]);
      execFileSync(
        "git",
        ["-c", "core.hooksPath=/dev/null", "commit", "-m", "dated change"],
        {
          cwd: f.author,
          env: {
            ...process.env,
            GIT_AUTHOR_DATE: date,
            GIT_COMMITTER_DATE: date,
          },
          stdio: "pipe",
        },
      );
      f.git(["push", "origin", "HEAD"]);
    };
    await f.put("docs/project/changes/z-old/change.json", record("z-old"));
    commit("2026-01-01T00:00:00Z");
    await f.put("docs/project/changes/a-new/change.json", record("a-new"));
    commit("2026-02-01T00:00:00Z");
    let snap = await f.store.refresh(f.project, DEFAULT_LIMITS);
    assert.deepEqual(
      snap.changes.map((g) => g.id),
      ["a-new", "z-old"],
    );
    assert.equal(snap.changes[1].createdAt, "2026-01-01T00:00:00.000Z");

    // A merge resolution may add a file without any non-merge addition commit.
    f.git(["checkout", "-b", "feature"]);
    await f.put("feature.txt", "feature");
    commit("2026-02-02T00:00:00Z");
    f.git(["checkout", "develop"]);
    f.git(["merge", "--no-ff", "--no-commit", "feature"]);
    await f.put(
      "docs/project/changes/merge-new/change.json",
      record("merge-new"),
    );
    commit("2026-03-01T00:00:00Z");
    await f.put(
      "docs/project/changes/z-old/change.json",
      record("z-old").replace('"title":"z-old"', '"title":"edited"'),
    );
    commit("2026-04-01T00:00:00Z");
    await f.put(
      "docs/project/archive/2026-05-01-z-old/requirement.md",
      "# Archived",
    );
    await rename(
      join(f.author, "docs/project/changes/z-old/change.json"),
      join(f.author, "docs/project/archive/2026-05-01-z-old/change.json"),
    );
    commit("2026-05-01T00:00:00Z");
    snap = await f.store.refresh(f.project, DEFAULT_LIMITS);
    assert.deepEqual(
      snap.changes.map((g) => g.id),
      ["merge-new", "a-new", "z-old"],
    );
    assert.equal(snap.changes[2].createdAt, "2026-01-01T00:00:00.000Z");
    assert.equal(snap.changes[0].createdAt, "2026-03-01T00:00:00.000Z");
    const warm = await f.store.refresh(f.project, DEFAULT_LIMITS);
    assert.deepEqual(
      warm.changes.map(({ id, createdAt }) => ({ id, createdAt })),
      snap.changes.map(({ id, createdAt }) => ({ id, createdAt })),
    );
  } finally {
    await f.cleanup();
  }
});
