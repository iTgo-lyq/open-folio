import test from "node:test";
import assert from "node:assert/strict";
import { rename, rm, writeFile } from "node:fs/promises";
import { execFileSync, spawnSync } from "node:child_process";
import { join, resolve } from "node:path";
import { checkPullRequest } from "../.agents/skills/spec-trail/setup/scripts/check-pr.mjs";
import { integrationFixture, completedChange } from "./integration-fixture.ts";

const cli = resolve(".agents/skills/spec-trail/setup/scripts/check-pr.mjs");
const changeBody = "Delivery\n\nSpecTrail-Change: example";
const releaseBody =
  "Release\n\nSpecTrail-Version: 1.0.0\nSpecTrail-Includes: example";
type Fixture = Awaited<ReturnType<typeof integrationFixture>>;
function event(f: Fixture, base = "develop", body = changeBody) {
  return {
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
    /valid completed archive/,
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
    const result = await checkPullRequest((args: string[]) => {
      assert.ok(["rev-parse", "show", "ls-tree", "cat-file"].includes(args[0]));
      return f.git(args);
    }, event(f));
    assert.equal(result.kind, "change");
    assert.deepEqual(result.changes, ["example"]);
    assert.equal(f.git(["status", "--porcelain"]), before);
  } finally {
    await f.cleanup();
  }
});

test("unarchived and reworked Changes fail even in Draft, then pass after archive is restored", async () => {
  const f = await integrationFixture();
  try {
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
    await assert.rejects(
      checkPullRequest(f.git, event(f)),
      /valid completed archive/,
    );
    await rm(join(f.author, "docs/project/changes/example"), {
      recursive: true,
    });
    await f.put(`${f.archivePath}/change.json`, JSON.stringify(f.record));
    f.commit(false);
    assert.equal((await checkPullRequest(f.git, event(f))).kind, "change");
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
      await assert.rejects(
        checkPullRequest(f.git, event(f, "develop", body)),
        /SpecTrail-Change/,
      );
    }
    const wrongOwner = event(f);
    wrongOwner.pull_request.head.ref = "another-source";
    await assert.rejects(checkPullRequest(f.git, wrongOwner), /ownership/);
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
      /Register this Change/,
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
    await assert.rejects(
      checkPullRequest(
        f.git,
        event(f, "main", `${releaseBody}\nSpecTrail-Includes: later`),
      ),
      /Change later.*valid completed archive/,
    );
    await assert.rejects(
      checkPullRequest(
        f.git,
        event(f, "main", `${releaseBody}\nSpecTrail-Includes: missing`),
      ),
      /Change missing.*valid completed archive/,
    );
    await assert.rejects(
      checkPullRequest(f.git, event(f, "main", changeBody)),
      /SpecTrail-Version/,
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
      [cli, "--repo", f.author, "--event", eventPath],
      { encoding: "utf8" },
    );
    assert.equal(JSON.parse(output).kind, "change");
    await writeFile(
      eventPath,
      JSON.stringify(event(f, "develop", "Missing marker")),
    );
    const failed = spawnSync(process.execPath, [cli, "--repo", f.author], {
      env: { ...process.env, GITHUB_EVENT_PATH: eventPath },
      encoding: "utf8",
    });
    assert.equal(failed.status, 1);
    assert.match(failed.stderr, /SpecTrail-Change/);
    assert.equal(f.git(["status", "--porcelain"]), "");
  } finally {
    await f.cleanup();
  }
});
