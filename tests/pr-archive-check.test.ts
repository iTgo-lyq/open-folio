import test from "node:test";
import assert from "node:assert/strict";
import { rename, rm, writeFile } from "node:fs/promises";
import { execFileSync, spawnSync } from "node:child_process";
import { join, resolve } from "node:path";
import { checkPullRequest as check } from "../.agents/skills/spec-trail/setup/scripts/check-pr.mjs";
import { integrationFixture, completedChange } from "./integration-fixture.ts";

const cli = resolve(".agents/skills/spec-trail/cli.mjs");
const changeBody = "Delivery\n\nSpecTrail-Change: example";
const releaseBody =
  "Release\n\nSpecTrail-Version: 1.0.0\nSpecTrail-Includes: example";
type Fixture = Awaited<ReturnType<typeof integrationFixture>>;
const checkPullRequest = (
  git: (args: string[]) => string,
  ev: ReturnType<typeof event>,
) => check(git, ev, ev.readPullRequests);

function event(f: Fixture, base = "develop", body = changeBody) {
  return {
    readPullRequests: f.readPullRequests,
    action: "synchronize",
    repository: { id: 1 },
    pull_request: {
      draft: true,
      body,
      base: { ref: base, sha: f.git(["rev-parse", base]), repo: { id: 1 } },
      head: {
        ref: f.git(["branch", "--show-current"]),
        sha: f.git(["rev-parse", "HEAD"]),
        repo: { id: 1 },
      },
    },
  };
}

test("delivery overrides cannot replace CI archive or integration evidence", async (t) => {
  const f = await integrationFixture();
  t.after(f.cleanup);
  const record = { ...f.record, deliveryOverride: "releaseMerged" };
  await f.put(`${f.archivePath}/change.json`, JSON.stringify(record));
  f.commit();
  assert.equal((await checkPullRequest(f.git, event(f))).kind, "change");
  await assert.rejects(
    checkPullRequest(f.git, event(f, "main", releaseBody)),
    /verified integration/,
  );
  f.merge();
  assert.equal(
    (await checkPullRequest(f.git, event(f, "main", releaseBody))).kind,
    "release",
  );
  f.git(["checkout", f.branch]);
  await f.put(
    `${f.archivePath}/change.json`,
    JSON.stringify({ ...record, status: "active", closure: {} }),
  );
  f.commit(false);
  await assert.rejects(
    checkPullRequest(f.git, event(f)),
    /valid completed archive|registered source branch/,
  );
});

test("PR archive check accepts its completed archive and leaves inherited planning and Git untouched", async () => {
  const f = await integrationFixture();
  try {
    await f.put(
      "docs/project/changes/later/change.json",
      JSON.stringify({
        ...completedChange("later"),
        status: "active",
        stage: "requirement",
        closure: {},
        tasks: {},
      }),
    );
    f.commit(false);
    const before = f.git(["status", "--porcelain"]);
    const result = await checkPullRequest(
      (args: string[]) => {
        assert.ok(
          ["rev-parse", "show", "ls-tree", "cat-file"].includes(args[0]),
        );
        return f.git(args);
      },
      event(
        f,
        "develop",
        `${changeBody}\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)`,
      ),
    );
    assert.equal(result.kind, "change");
    assert.deepEqual(result.changes, ["example"]);
    assert.equal(f.git(["status", "--porcelain"]), before);
  } finally {
    await f.cleanup();
  }
});

test("archive prototype containment is checked before merge", async (t) => {
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
  f.commit(false);
  await assert.rejects(
    checkPullRequest(f.git, event(f)),
    /inside the archive subtree/,
  );
});

test("unarchived and reworked Changes fail even in Draft, then pass after archive is restored", async () => {
  const f = await integrationFixture();
  try {
    const eventPath = join(f.root, "event.json");
    const runCheck = async () => {
      await writeFile(eventPath, JSON.stringify(event(f)));
      return spawnSync(
        process.execPath,
        [cli, "setup", "check-pr", "--repo", f.author, "--event", eventPath],
        { encoding: "utf8" },
      );
    };
    await f.put("docs/project/changes/example/requirement.md", "# Rework");
    await rename(
      join(f.author, f.archivePath, "change.json"),
      join(f.author, "docs/project/changes/example/change.json"),
    );
    await f.put(
      "docs/project/changes/example/change.json",
      JSON.stringify({
        ...f.record,
        status: "active",
        stage: "execution",
        closure: {},
      }),
    );
    f.commit(false);
    const rejected = await runCheck();
    assert.equal(rejected.status, 1, rejected.stderr);
    assert.equal(rejected.stdout, "");
    assert.match(rejected.stderr, /valid completed archive/);
    await rm(join(f.author, "docs/project/changes/example"), {
      recursive: true,
    });
    await f.put(`${f.archivePath}/change.json`, JSON.stringify(f.record));
    f.commit(false);
    const accepted = await runCheck();
    assert.equal(accepted.status, 0, accepted.stderr);
    assert.equal(JSON.parse(accepted.stdout).kind, "change");
  } finally {
    await f.cleanup();
  }
});

test("missing acceptance, Specs, unfinished tasks and duplicate live/archive records cannot pass", async () => {
  const f = await integrationFixture();
  try {
    for (const mutation of [
      { closure: { ...f.record.closure, acceptance: undefined } },
      { closure: { ...f.record.closure, specs: undefined } },
      { tasks: { T1: { title: "Deliver", status: "doing" } } },
    ]) {
      await f.put(
        `${f.archivePath}/change.json`,
        JSON.stringify({ ...f.record, ...mutation }),
      );
      f.commit(false);
      await assert.rejects(
        checkPullRequest(f.git, event(f)),
        /valid completed archive/,
      );
    }
    await f.put(`${f.archivePath}/change.json`, JSON.stringify(f.record));
    await f.put(
      "docs/project/changes/example/change.json",
      JSON.stringify(f.record),
    );
    f.commit(false);
    await assert.rejects(
      checkPullRequest(f.git, event(f)),
      /valid completed archive/,
    );
  } finally {
    await f.cleanup();
  }
});

test("metadata edits, ownership, source SHA, target and repository identity are checked", async () => {
  const f = await integrationFixture();
  try {
    for (const body of [
      "",
      "Text\n\n```\nSpecTrail-Change: example\n```",
      `${changeBody}\nSpecTrail-Change: example`,
      releaseBody,
    ]) {
      assert.equal(
        (await checkPullRequest(f.git, event(f, "develop", body))).kind,
        "change",
      );
    }
    const wrongOwner = event(f);
    wrongOwner.pull_request.head.ref = "another-source";
    await assert.rejects(
      checkPullRequest(f.git, wrongOwner),
      /registered source branch/,
    );
    const stale = event(f);
    stale.pull_request.head.sha = f.base;
    await assert.rejects(checkPullRequest(f.git, stale), /exact PR head SHA/);
    const otherRepo = event(f);
    otherRepo.pull_request.head.repo.id = 2;
    await assert.rejects(checkPullRequest(f.git, otherRepo), /same-repository/);
    const target = event(f);
    target.pull_request.base.ref = "other-target";
    await assert.rejects(
      checkPullRequest(f.git, target),
      /configured delivery branch/,
    );
    const unregistered = event(f);
    unregistered.pull_request.base.sha = f.git(["rev-parse", "main"]);
    await assert.rejects(
      checkPullRequest(f.git, unregistered),
      /Register this Change|registered source branch/,
    );
  } finally {
    await f.cleanup();
  }
});

test("a Change PR cannot introduce another archive", async () => {
  const f = await integrationFixture();
  try {
    const other = completedChange("another");
    await f.put(
      `${other.closure.archive.path}/change.json`,
      JSON.stringify(other),
    );
    f.commit(false);
    await assert.rejects(
      checkPullRequest(f.git, event(f)),
      /exactly its own archive/,
    );
  } finally {
    await f.cleanup();
  }
});

test("release without new Changes accepts documentation and inherited planning", async (t) => {
  const f = await integrationFixture();
  t.after(f.cleanup);
  f.merge();
  f.git(["checkout", "main"]);
  f.git(["merge", "--no-ff", "develop", "-m", "Release baseline"]);
  f.git(["checkout", "develop"]);
  await f.put("README.md", "# Updated skill documentation\n");
  await f.put(
    "docs/project/changes/later/change.json",
    JSON.stringify({
      ...completedChange("later"),
      status: "active",
      stage: "requirement",
      closure: {},
      tasks: {},
    }),
  );
  const source = f.commit(false);
  assert.deepEqual(
    await checkPullRequest(
      f.git,
      event(f, "main", "Maintenance\n\nSpecTrail-Version: 1.0.1"),
    ),
    { kind: "release", changes: [], source },
  );
  assert.equal(f.git(["status", "--porcelain"]), "");
});

test("omitting the release Change list cannot add, edit or delete archives", async (t) => {
  const f = await integrationFixture();
  t.after(f.cleanup);
  const body = "Maintenance\n\nSpecTrail-Version: 1.0.1";
  await assert.rejects(
    checkPullRequest(f.git, event(f, "main", body)),
    /verified integration|read-only|not a valid object|does not exist/,
  );
  f.merge();
  f.git(["checkout", "main"]);
  f.git(["merge", "--no-ff", "develop", "-m", "Release baseline"]);
  f.git(["checkout", "develop"]);
  // Archive paths outside any new Change record are read-only too.
  await f.put("docs/project/archive/notes.md", "# Notes\n");
  f.commit(false);
  await assert.rejects(
    checkPullRequest(f.git, event(f, "main", body)),
    /archive\/notes\.md: released archives are read-only/,
  );
  await rm(join(f.author, "docs/project/archive/notes.md"));
  f.commit(false);
  assert.equal(
    (await checkPullRequest(f.git, event(f, "main", body))).kind,
    "release",
  );
  await f.put(`${f.archivePath}/requirement.md`, "# Edited history\n");
  f.commit(false);
  await assert.rejects(
    checkPullRequest(f.git, event(f, "main", body)),
    /verified integration|read-only|not a valid object|does not exist/,
  );
  await rm(join(f.author, f.archivePath), { recursive: true });
  f.commit(false);
  await assert.rejects(
    checkPullRequest(f.git, event(f, "main", body)),
    /verified integration|read-only|not a valid object|does not exist/,
  );
});

test("release checks only included Changes, requiring valid integration and unchanged archives", async () => {
  const f = await integrationFixture();
  try {
    await assert.rejects(
      checkPullRequest(f.git, event(f, "main", releaseBody)),
      /verified integration/,
    );
    f.merge();
    await f.put(
      "docs/project/changes/later/change.json",
      JSON.stringify({
        ...completedChange("later"),
        status: "active",
        stage: "requirement",
        closure: {},
        tasks: {},
      }),
    );
    f.commit(false);
    assert.equal(
      (await checkPullRequest(f.git, event(f, "main", releaseBody))).kind,
      "release",
    );
    for (const body of [
      "",
      changeBody,
      `${releaseBody}\nSpecTrail-Includes: missing`,
    ])
      assert.equal(
        (await checkPullRequest(f.git, event(f, "main", body))).kind,
        "release",
      );
    await f.put(
      `${f.archivePath}/requirement.md`,
      "# Changed after integration",
    );
    f.commit(false);
    await assert.rejects(
      checkPullRequest(f.git, event(f, "main", releaseBody)),
      /modified its integrated archive/,
    );
  } finally {
    await f.cleanup();
  }
});

test("release preparation can contain M through its second parent, but copying an archive is insufficient", async () => {
  const f = await integrationFixture();
  try {
    const merged = f.merge();
    f.git(["checkout", "-b", "release/frozen", "main"]);
    f.git(["merge", "--no-ff", "develop", "-m", "Freeze candidate"]);
    assert.equal(
      (await checkPullRequest(f.git, event(f, "main", releaseBody))).kind,
      "release",
    );
    f.git(["checkout", "-b", "release/copied", "main"]);
    f.git(["checkout", merged, "--", f.archivePath]);
    f.commit(false);
    await assert.rejects(
      checkPullRequest(f.git, event(f, "main", releaseBody)),
      /not in the release candidate/,
    );
  } finally {
    await f.cleanup();
  }
});

test("custom delivery branch names work", async () => {
  const f = await integrationFixture();
  try {
    f.git(["branch", "-m", "develop", "integration"]);
    f.git(["branch", "-m", "main", "stable"]);
    await f.put(
      "docs/project/workflow.json",
      JSON.stringify({
        schemaVersion: 3,
        integrationBranch: "integration",
        releaseBranch: "stable",
      }),
    );
    f.commit(false);
    assert.equal(
      (await checkPullRequest(f.git, event(f, "integration"))).kind,
      "change",
    );
  } finally {
    await f.cleanup();
  }
});

test("CLI reads PR JSON as data and propagates failed archive checks", async () => {
  const f = await integrationFixture();
  try {
    const eventPath = join(f.root, "event.json");
    await writeFile(
      eventPath,
      JSON.stringify(
        event(
          f,
          "develop",
          `Do not execute $(touch /tmp/spec-trail-injection)\n\nSpecTrail-Change: example`,
        ),
      ),
    );
    const output = execFileSync(
      process.execPath,
      [cli, "setup", "check-pr", "--repo", f.author, "--event", eventPath],
      { encoding: "utf8" },
    );
    assert.equal(JSON.parse(output).kind, "change");
    await writeFile(
      eventPath,
      JSON.stringify({
        ...event(f, "develop", "No marker"),
        pull_request: {
          ...event(f).pull_request,
          head: { ...event(f).pull_request.head, ref: "unregistered" },
        },
      }),
    );
    const failed = spawnSync(
      process.execPath,
      [cli, "setup", "check-pr", "--repo", f.author],
      {
        env: { ...process.env, GITHUB_EVENT_PATH: eventPath },
        encoding: "utf8",
      },
    );
    assert.equal(failed.status, 1);
    assert.match(failed.stderr, /registered source branch/);
    assert.equal(f.git(["status", "--porcelain"]), "");
  } finally {
    await f.cleanup();
  }
});

test("historical direct child delivery can release while its parent is still active", async (t) => {
  const f = await integrationFixture();
  t.after(f.cleanup);
  await f.put(
    `${f.archivePath}/change.json`,
    JSON.stringify({ ...f.record, parent: "parent" }),
  );
  await f.put(
    "docs/project/changes/parent/change.json",
    JSON.stringify({
      schemaVersion: 1,
      id: "parent",
      title: "Parent",
      size: "xlarge",
      branch: "develop",
      status: "active",
      stage: "requirement",
      confirmations: {},
      tasks: {},
      closure: {},
      children: [f.id],
    }),
  );
  f.commit();
  f.merge();
  assert.equal(
    (await checkPullRequest(f.git, event(f, "main", releaseBody))).kind,
    "release",
  );
});

for (const completed of [true, false]) {
  test(`unmarked parent delivery accepts its ${completed ? "completed" : "cancelled"} child`, async (t) => {
    const f = await integrationFixture("parent");
    t.after(f.cleanup);
    const child = { ...completedChange("child"), parent: "parent" };
    await f.register({ child: child.branch });
    const confirmed = { at: "2026-10-18T00:00:00.000Z", summary: "Confirmed" };
    await f.put(
      `${f.archivePath}/change.json`,
      JSON.stringify({
        ...f.record,
        size: "xlarge",
        tasks: {},
        children: [child.id],
        confirmations: {
          requirement: confirmed,
          technical: confirmed,
          plan: confirmed,
        },
      }),
    );
    if (completed) {
      f.commit();
      f.git(["checkout", "-b", child.branch]);
      await f.put(
        `${child.closure.archive.path}/change.json`,
        JSON.stringify(child),
      );
      f.commit();
      f.git(["checkout", f.branch]);
      f.git(["merge", "--no-ff", child.branch, "-m", "Deliver child"]);
      f.git(["push", "origin", f.branch]);
      const pr = f.recordMerge(child.id, child.branch);
      pr.body = "Deliver child";
      pr.base.branch = f.branch;
    } else {
      const live = `docs/project/changes/${child.id}/change.json`;
      const active = {
        ...child,
        status: "active",
        stage: "requirement",
        tasks: {},
        closure: {},
      };
      await f.put(live, JSON.stringify(active));
      f.commit();
      f.git(["checkout", "-b", child.branch]);
      await f.put(
        live,
        JSON.stringify({
          ...active,
          status: "cancelled",
          cancellation: { at: confirmed.at, reason: "No longer needed" },
        }),
      );
      f.commit();
      f.git(["checkout", f.branch]);
    }
    const result = await checkPullRequest(
      f.git,
      event(f, "develop", "Deliver parent"),
    );
    assert.equal(result.kind, "change");
    assert.deepEqual(
      result.changes,
      completed ? ["parent", "child"] : ["parent"],
    );
  });
}

test("an empty release range cannot hide a duplicate existing archive or live identity", async (t) => {
  const f = await integrationFixture();
  t.after(f.cleanup);
  f.merge();
  f.git(["checkout", "main"]);
  f.git(["merge", "--no-ff", "develop", "-m", "First release"]);
  f.git(["push", "origin", "main"]);
  f.git(["checkout", "-b", "release/next"]);
  const path = "docs/project/archive/2026-10-19-example";
  const duplicate = structuredClone(f.record);
  duplicate.closure.archive.path = path;
  await f.put(`${path}/change.json`, JSON.stringify(duplicate));
  f.commit(false);
  await assert.rejects(
    checkPullRequest(f.git, event(f, "main", "No new Changes")),
    /unique archive/,
  );
  f.git(["reset", "--hard", "main"]);
  await f.put(
    "docs/project/changes/example/change.json",
    JSON.stringify({
      ...f.record,
      status: "active",
      stage: "requirement",
      closure: {},
    }),
  );
  f.commit(false);
  await assert.rejects(
    checkPullRequest(f.git, event(f, "main", "No new Changes")),
    /unique archive/,
  );
});
