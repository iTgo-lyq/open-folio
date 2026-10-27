import test from "node:test";
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { xlargeFixture } from "./xlarge-fixture.ts";
import { DEFAULT_LIMITS } from "../src/lib/model.ts";

test("child handoff separates central registration and parent code; parent archive survives child deletion", async (t) => {
  const f = await xlargeFixture();
  t.after(f.cleanup);
  const preview = f.handoff(["--dry-run"]);
  assert.equal(preview.targetBranch, "feature/whole");
  const result = f.handoff();
  assert.equal(result.targetBranch, "feature/whole");
  assert.equal(
    await readFile(join(f.child, "parent-feature.txt"), "utf8"),
    "Only in parent\n",
  );
  assert.throws(() => f.git(["show", "develop:parent-feature.txt"]));
  assert.equal(f.handoff().commit, result.commit);
  await f.archiveChild();
  f.mergeChild();
  f.git(["push", "origin", "--delete", "feature/part"]);
  f.git(["worktree", "remove", f.child]);
  f.git(["branch", "-D", "feature/part"]);
  const shown = f.cli("change", f.author, "child", "show");
  assert.equal(shown.branch, "feature/whole");
  assert.equal(shown.state.branch, "feature/part");
  const snapshot = await f.store.refresh(f.project, DEFAULT_LIMITS, f.context);
  const child = snapshot.changes.find((c) => c.id === "child")!;
  assert.ok(child.primary, JSON.stringify(child.diagnostics));
  assert.equal(child.candidates[0].branch, "feature/whole");
  assert.equal(child.candidates[0].validCompleted, true);
});

test("child handoff retries a failed central publication without publishing parent implementation", async (t) => {
  const f = await xlargeFixture();
  t.after(f.cleanup);
  const hook = join(f.remote, "hooks/pre-receive");
  await writeFile(
    hook,
    '#!/bin/sh\nwhile read old new ref; do\n if [ "$ref" = "refs/heads/develop" ]; then exit 1; fi\ndone\n',
    { mode: 0o755 },
  );
  f.handoff([], 1);
  await writeFile(hook, "#!/bin/sh\nexit 0\n", { mode: 0o755 });
  f.handoff();
  assert.throws(() => f.git(["show", "origin/develop:parent-feature.txt"]));
  assert.equal(
    f.cli("change", f.author, "child", "show").state.branch,
    "feature/part",
  );
});

test("child PRs, sibling dependencies, parent closure and cleanup use the actual delivery target", async (t) => {
  const f = await xlargeFixture();
  t.after(f.cleanup);
  const { repository } = await import(
    "../.agents/skills/spec-trail/scripts/repository.mjs"
  );
  const { preflight, verify, cleanup } = await import(
    "../.agents/skills/spec-trail/scripts/integration.mjs"
  );
  const { checkPullRequest } = await import(
    "../.agents/skills/spec-trail/setup/scripts/check-pr.mjs"
  );
  const { githubCli } = await import("./github-cli-fixture.ts");
  const { completedChange } = await import("./integration-fixture.ts");
  const { rm } = await import("node:fs/promises");
  const event = (cwd: string, id: string, base: string) => ({
    repository: { id: 1 },
    pull_request: {
      body: `Delivery\n\nSpecTrail-Change: ${id}`,
      head: {
        sha: f.at(cwd, "rev-parse", "HEAD"),
        ref: f.at(cwd, "branch", "--show-current"),
        repo: { id: 1 },
      },
      base: {
        sha: f.at(cwd, "rev-parse", `origin/${base}`),
        ref: base,
        repo: { id: 1 },
      },
    },
  });
  const check = (cwd: string, id: string, base: string) =>
    checkPullRequest(
      (args: string[]) => f.at(cwd, ...args),
      event(cwd, id, base),
      f.readPullRequests,
    );
  f.handoff();
  await f.archiveChild();
  assert.equal(
    (await preflight(repository(f.author), "child", f.readPullRequests))
      .integrationBranch,
    "feature/whole",
  );
  await check(f.child, "child", "feature/whole");
  await assert.rejects(check(f.child, "child", "develop"), /parent|target/);
  const first = f.mergeChild();
  assert.equal(
    (await verify(repository(f.author), "child", f.readPullRequests))
      .integration.commit,
    first,
  );
  const env = await githubCli(f, f.pullRequests);
  assert.match(
    f.cli(
      "change",
      f.child,
      "child",
      "rework",
      ["--stage", "execution", "--reason", "Fix", "--approach", "Retry"],
      1,
      env,
    ),
    /read-only/,
  );
  const removed = await cleanup(repository(f.parent), "child", {
    verifiedCommit: first,
    idleWorktree: f.child,
  });
  assert.equal(removed.cleanup.remote.status, "cleaned");
  assert.equal(removed.cleanup.worktree.status, "cleaned");
  assert.equal(
    f.cli("change", f.author, "child", "show", [], 0, env).state.status,
    "completed",
  );

  const secondState = JSON.parse(
    await readFile(
      join(f.author, "docs/project/changes/second/change.json"),
      "utf8",
    ),
  );
  secondState.dependsOn = ["child"];
  await f.put(
    "docs/project/changes/second/change.json",
    JSON.stringify(secondState),
  );
  f.commit();
  const second = join(f.root, "second");
  f.cli(
    "workspace",
    f.author,
    "second",
    "handoff",
    ["--path", second, "--branch", "feature/second"],
    0,
    env,
  );
  f.cli("change", second, "second", "execute", [], 0, env);
  const secondRecord = {
    ...completedChange("second", "feature/second"),
    parent: "parent",
    dependsOn: ["child"],
  };
  await rm(join(second, "docs/project/changes/second"), { recursive: true });
  await f.putAt(
    second,
    `${secondRecord.closure.archive.path}/change.json`,
    JSON.stringify(secondRecord),
  );
  await f.putAt(
    second,
    `${secondRecord.closure.archive.path}/requirement.md`,
    "# Second delivered\n",
  );
  f.commitAt(second);
  await check(second, "second", "feature/whole");
  f.at(f.parent, "merge", "--no-ff", "feature/second", "-m", "Second delivery");
  f.at(f.parent, "push", "origin", "HEAD");
  const secondMerge = f.at(f.parent, "rev-parse", "HEAD");
  f.recordMerge("second", "feature/second", secondMerge).base.branch =
    "feature/whole";
  await writeFile(
    join(f.root, "github-prs.json"),
    JSON.stringify(
      f.pullRequests.map((await import("./github-cli-fixture.ts")).githubWire),
    ),
  );
  await f.putAt(
    f.parent,
    "docs/project/changes/parent/plan.md",
    "# Child deliveries\n",
  );
  for (const phase of ["technical", "plan"])
    f.cli(
      "change",
      f.parent,
      "parent",
      "confirm",
      ["--phase", phase, "--summary", "Whole delivery", "--source", "Fixture"],
      0,
      env,
    );
  f.cli("change", f.parent, "parent", "execute", [], 0, env);
  f.cli(
    "change",
    f.parent,
    "parent",
    "verify",
    ["--result", "passed", "--summary", "Whole validated"],
    0,
    env,
  );
  f.cli(
    "change",
    f.parent,
    "parent",
    "accept",
    ["--mode", "user", "--summary", "Accepted", "--source", "Fixture"],
    0,
    env,
  );
  f.cli(
    "change",
    f.parent,
    "parent",
    "specs",
    ["--result", "not_needed", "--summary", "No specs"],
    0,
    env,
  );
  f.cli(
    "change",
    f.parent,
    "parent",
    "archive",
    ["--date", "2026-10-27", "--summary", "Deliver family"],
    0,
    env,
  );
  f.commitAt(f.parent);
  assert.deepEqual((await check(f.parent, "parent", "develop")).changes, [
    "parent",
    "child",
    "second",
  ]);
  f.git(["merge", "--no-ff", "feature/whole", "-m", "Parent delivery"]);
  f.git(["push", "origin", "HEAD"]);
  const parentMerge = f.git(["rev-parse", "HEAD"]);
  f.recordMerge("parent", "feature/whole", parentMerge);
  assert.equal(
    (await verify(repository(f.author), "child", f.readPullRequests))
      .integration.commit,
    first,
  );
  const removedParent = await cleanup(repository(f.author), "parent", {
    verifiedCommit: parentMerge,
    idleWorktree: f.parent,
  });
  assert.equal(removedParent.cleanup.remote.status, "cleaned");
  assert.equal(
    f.cli("change", f.author, "child", "show", [], 0, env).branch,
    "develop",
  );
});

test('interrupted child handoff refuses a changed parent baseline on retry', async t => {
  const f=await xlargeFixture(); t.after(f.cleanup);
  const hook=join(f.remote,'hooks/pre-receive');
  await writeFile(hook,'#!/bin/sh\nwhile read old new ref; do\n if [ "$ref" = "refs/heads/develop" ]; then exit 1; fi\ndone\n',{mode:0o755});
  f.handoff([],1);
  await writeFile(hook,'#!/bin/sh\nexit 0\n',{mode:0o755});
  await f.putAt(f.parent,'new-parent.txt','Changed baseline\n'); f.commitAt(f.parent);
  assert.match(f.handoff([],1),/Parent baseline changed/);
});
