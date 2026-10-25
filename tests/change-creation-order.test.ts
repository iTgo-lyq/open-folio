import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { rename } from "node:fs/promises";
import { join } from "node:path";
import { fixture } from "./fixture.ts";
import { DEFAULT_LIMITS, type ChangeGroup } from "../src/lib/model.ts";
import { changeCreator, compareChangeCreation } from "../src/server/changes.ts";
import { projectChange } from "../src/server/shared-change.ts";

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
    const commit = (date: string, author = ["Ada", "ada@example.com"]) => {
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
            GIT_AUTHOR_NAME: author[0],
            GIT_AUTHOR_EMAIL: author[1],
          },
          stdio: "pipe",
        },
      );
      f.git(["push", "origin", "HEAD"]);
    };
    await f.put("docs/project/changes/z-old/change.json", record("z-old"));
    commit("2026-01-01T00:00:00Z");
    await f.put("docs/project/changes/a-new/change.json", record("a-new"));
    commit("2026-02-01T00:00:00Z", [
      "Grace",
      "12345+grace-h@users.noreply.github.com",
    ]);
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
    commit("2026-03-01T00:00:00Z", ["Linus", "linus@example.org"]);
    await f.put(
      "docs/project/changes/z-old/change.json",
      record("z-old").replace('"title":"z-old"', '"title":"edited"'),
    );
    commit("2026-04-01T00:00:00Z", ["Editor", "editor@example.com"]);
    await f.put(
      "docs/project/archive/2026-05-01-z-old/requirement.md",
      "# Archived",
    );
    await rename(
      join(f.author, "docs/project/changes/z-old/change.json"),
      join(f.author, "docs/project/archive/2026-05-01-z-old/change.json"),
    );
    commit("2026-05-01T00:00:00Z", ["Archivist", "archivist@example.com"]);
    snap = await f.store.refresh(f.project, DEFAULT_LIMITS);
    assert.deepEqual(
      snap.changes.map((g) => g.id),
      ["merge-new", "a-new", "z-old"],
    );
    assert.equal(snap.changes[2].createdAt, "2026-01-01T00:00:00.000Z");
    assert.equal(snap.changes[0].createdAt, "2026-03-01T00:00:00.000Z");
    // 创建者取首次加入的提交作者：后续编辑与归档不改变；合并引入取合并提交作者；邮箱不进入快照。
    assert.deepEqual(
      snap.changes.map(({ id, creator }) => ({ id, creator })),
      [
        { id: "merge-new", creator: { name: "Linus" } },
        {
          id: "a-new",
          creator: { name: "Grace", login: "grace-h", subjectId: "12345" },
        },
        { id: "z-old", creator: { name: "Ada" } },
      ],
    );
    assert.doesNotMatch(JSON.stringify(snap.changes), /@example|noreply/);
    assert.deepEqual(projectChange(snap, "a-new", "fixture").change.creator, {
      name: "Grace",
      login: "grace-h",
      subjectId: "12345",
    });
    const warm = await f.store.refresh(f.project, DEFAULT_LIMITS);
    assert.deepEqual(
      warm.changes.map(({ id, createdAt, creator }) => ({
        id,
        createdAt,
        creator,
      })),
      snap.changes.map(({ id, createdAt, creator }) => ({
        id,
        createdAt,
        creator,
      })),
    );
  } finally {
    await f.cleanup();
  }
});

test("creator keeps the Git name and only derives a login from GitHub noreply addresses", () => {
  assert.deepEqual(
    changeCreator("Grace Hopper", "12345+grace-h@users.noreply.github.com"),
    { name: "Grace Hopper", login: "grace-h", subjectId: "12345" },
  );
  assert.deepEqual(changeCreator("", "octocat@users.noreply.github.com"), {
    name: "octocat",
    login: "octocat",
  });
  assert.deepEqual(changeCreator("Ada", "ada@example.com"), { name: "Ada" });
  assert.deepEqual(
    changeCreator("Mallory", "evil@users.noreply.github.com.example"),
    { name: "Mallory" },
  );
  assert.equal(changeCreator("  ", "nobody@example.com"), undefined);
});
