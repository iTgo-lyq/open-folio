import { githubCli } from "./github-cli-fixture.ts";
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  rmSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { completedChange } from "./integration-fixture.ts";
const stateScript = resolve(".agents/skills/spec-trail/scripts/change.mjs");
const workspaceScript = resolve(
  ".agents/skills/spec-trail/scripts/workspace.mjs",
);
const at = (root: string, ...args: string[]) =>
  execFileSync("git", ["-C", root, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
function fixture(t: import("node:test").TestContext) {
  const root = mkdtempSync(join(tmpdir(), "folio-workspace-")),
    repo = join(root, "main"),
    remote = join(root, "remote.git"),
    work = join(root, "work");
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(repo);
  mkdirSync(remote);
  at(remote, "init", "--bare");
  at(repo, "init", "-b", "develop");
  at(repo, "config", "user.name", "Workspace test");
  at(repo, "config", "user.email", "workspace@example.invalid");
  at(repo, "remote", "add", "origin", remote);
  const put = (path: string, content: string, cwd = repo) => {
    mkdirSync(dirname(join(cwd, path)), { recursive: true });
    writeFileSync(join(cwd, path), content);
  };
  put(
    "docs/project/workflow.json",
    JSON.stringify({
      schemaVersion: 3,
      integrationBranch: "develop",
      releaseBranch: "main",
    }),
  );
  const commit = (cwd = repo) => {
    at(cwd, "add", ".");
    at(cwd, "commit", "-m", "Fixture update");
    at(cwd, "push", "origin", "HEAD");
  };
  commit();
  at(repo, "push", "origin", "HEAD:main");
  const run = (
    script: string,
    command: string,
    options: string[] = [],
    expected = 0,
    id = "sample",
    cwd = repo,
  ) => {
    const result = spawnSync(
      process.execPath,
      [script, command, "--repo", cwd, "--change", id, ...options],
      { encoding: "utf8" },
    );
    assert.equal(
      result.status,
      expected,
      `${command}: ${result.stdout}\n${result.stderr}`,
    );
    return expected ? result.stderr : JSON.parse(result.stdout);
  };
  const state = (
    cmd: string,
    opts: string[] = [],
    expected = 0,
    id = "sample",
    cwd = repo,
  ) => run(stateScript, cmd, opts, expected, id, cwd);
  const workspace = (
    cmd: string,
    opts: string[] = [],
    expected = 0,
    id = "sample",
    cwd = repo,
  ) => run(workspaceScript, cmd, opts, expected, id, cwd);
  const planning = (id = "sample") => {
    state("create", ["--title", "Test goal", "--size", "small"], 0, id);
    state("task-add", ["--title", "Implement"], 0, id);
    put(`docs/project/changes/${id}/requirement.md`, "# Requirement\n");
    commit();
  };
  const handoff = (expected = 0, id = "sample") =>
    workspace(
      "handoff",
      ["--path", id === "sample" ? work : join(root, id)],
      expected,
      id,
    );
  const reject = (branch: string) => {
    const path = join(remote, "hooks/pre-receive");
    writeFileSync(
      path,
      `#!/bin/sh\nwhile read old new ref; do\n if [ "$ref" = "refs/heads/${branch}" ]; then exit 1; fi\ndone\n`,
      { mode: 0o755 },
    );
    return () => rmSync(path);
  };
  return {
    root,
    repo,
    remote,
    work,
    put,
    commit,
    state,
    workspace,
    planning,
    handoff,
    reject,
  };
}
test("planning stays on develop; shared registration is idempotent and routes stale copies to work", (t) => {
  const f = fixture(t);
  f.planning();
  f.planning("other");
  const main = at(f.remote, "rev-parse", "main");
  assert.match(f.state("execute", [], 1), /Handoff/);
  const before = at(f.repo, "rev-parse", "HEAD");
  f.workspace("handoff", ["--path", f.work, "--dry-run"]);
  assert(!existsSync(f.work));
  assert.equal(at(f.repo, "rev-parse", "HEAD"), before);
  const result = f.handoff();
  assert.equal(at(f.repo, "branch", "--show-current"), "develop");
  assert.equal(
    at(f.remote, "rev-parse", "develop"),
    at(f.remote, "rev-parse", "change/sample"),
  );
  assert.equal(
    at(f.repo, "diff", "--name-only", before, "HEAD"),
    "docs/project/changes/sample/change.json",
  );
  assert.equal(f.handoff().commit, result.commit);
  f.state("execute", [], 0, "sample", f.work);
  f.commit(f.work);
  assert.equal(f.state("show").state.stage, "execution"); // push updates the shared tracking ref
  f.workspace("prepare");
  assert.equal(f.state("show").state.stage, "execution");
  assert.match(
    f.state("retitle", ["--title", "Wrong writer"], 1),
    /inherited entries/,
  );
  assert.match(
    f.state("retitle", ["--title", "Wrong writer"], 1, "other", f.work),
    /inherited entries/,
  );
  assert.equal(at(f.remote, "rev-parse", "main"), main);
});

test("predeclared targets stay writable planning until explicit handoff publishes their own source", (t) => {
  const f = fixture(t);
  f.planning();
  const path = "docs/project/changes/sample/change.json";
  const initial = JSON.parse(readFileSync(join(f.repo, path), "utf8"));
  f.put(
    path,
    JSON.stringify({
      ...initial,
      branch: "feature/future",
      tasks: {},
      waitingFor: { kind: "pause", summary: "Record only" },
    }),
  );
  f.commit();
  assert.equal(f.state("show").state.branch, "feature/future");
  assert.equal(f.workspace("locate").branch, "develop");
  assert.equal(f.workspace("locate").worktree, null);
  assert.equal(f.workspace("locate").planningWorkspace, f.repo);
  f.state("clarification-ask", [
    "--round",
    "1",
    "--text",
    "Scope?",
    "--recommendation",
    "Keep it focused",
  ]);
  f.state("retitle", ["--title", "Still a deferred requirement"]);
  const updated = JSON.parse(readFileSync(join(f.repo, path), "utf8"));
  assert.equal(updated.waitingFor.kind, "pause");
  assert.equal(updated.branch, "feature/future");
  assert(!existsSync(f.work));
  assert.match(f.workspace("prepare", [], 1), /handoff/);
  assert.match(f.handoff(1), /pause|waiting condition/);
  f.state("resume");
  f.state("task-add", ["--title", "Implement after resuming"]);
  f.commit();
  const before = at(f.repo, "rev-parse", "HEAD");
  const result = f.handoff();
  assert.equal(result.branch, "feature/future");
  assert.equal(at(f.work, "rev-parse", "HEAD"), before); // No empty registration commit.
  assert.equal(at(f.remote, "rev-parse", "feature/future"), before);
  assert.match(
    f.state("retitle", ["--title", "Wrong writer"], 1),
    /inherited entries/,
  );
});
test("predeclared parent and child allow central clarification but require real parent handoff before child execution", (t) => {
  const f = fixture(t);
  f.state(
    "create",
    ["--title", "Whole", "--size", "xlarge", "--children", "sample"],
    0,
    "whole",
  );
  f.state("create", [
    "--title",
    "Part",
    "--size",
    "small",
    "--parent",
    "whole",
  ]);
  for (const id of ["whole", "sample"]) {
    const path = `docs/project/changes/${id}/change.json`;
    const state = JSON.parse(readFileSync(join(f.repo, path), "utf8"));
    f.put(
      path,
      JSON.stringify({
        ...state,
        branch: `feature/${id}`,
        waitingFor: { kind: "pause", summary: "Record only" },
      }),
    );
    f.put(`docs/project/changes/${id}/requirement.md`, `# ${id}`);
  }
  f.commit();
  assert.equal(f.state("show").state.branch, "feature/sample");
  assert.equal(f.workspace("locate").branch, "develop");
  assert.equal(f.workspace("locate").worktree, null);
  f.state("clarification-ask", [
    "--round",
    "1",
    "--text",
    "Scope?",
    "--recommendation",
    "Keep it focused",
  ]);
  f.state("retitle", ["--title", "Still planning the child"]);
  const state = JSON.parse(
    readFileSync(
      join(f.repo, "docs/project/changes/sample/change.json"),
      "utf8",
    ),
  );
  assert.equal(state.waitingFor.kind, "pause");
  assert.equal(state.title, "Still planning the child");
  f.state("resume");
  f.state("task-add", ["--title", "Implement after parent handoff"]);
  f.commit();
  assert.match(f.handoff(1), /parent has not actually been handed off/);
  assert(!existsSync(f.work));
  assert.equal(at(f.repo, "show-ref", "--heads").includes("feature/"), false);
  // Malformed cyclic parents retain a clear diagnostic before recursion.
  const parentPath = "docs/project/changes/whole/change.json";
  const parent = JSON.parse(readFileSync(join(f.repo, parentPath), "utf8"));
  f.put(parentPath, JSON.stringify({ ...parent, parent: "sample" }));
  f.commit();
  assert.match(f.state("show", [], 1), /parent is missing or nested/);
  assert.match(f.workspace("locate", [], 1), /parent is missing or nested/);
});
for (const size of ["medium", "large", "xlarge"]) {
  test(`${size} hands off before Plan and keeps execution confirmation gates`, (t) => {
    const f = fixture(t);
    f.state("create", [
      "--title",
      "Plan in work branch",
      "--size",
      size,
      ...(size === "xlarge" ? ["--children", "child"] : []),
    ]);
    if (size === "xlarge")
      f.state(
        "create",
        ["--title", "Child delivery", "--size", "small", "--parent", "sample"],
        0,
        "child",
      );
    for (const name of ["requirement", "technical"])
      f.put(`docs/project/changes/sample/${name}.md`, `# ${name}\n`);
    f.commit();
    f.handoff(1);
    assert(!existsSync(f.work));
    const confirm = (phase: string, cwd = f.repo) =>
      f.state(
        "confirm",
        ["--phase", phase, "--summary", "Scope", "--source", "Fixture"],
        0,
        "sample",
        cwd,
      );
    confirm("requirement");
    f.commit();
    if (size === "large") {
      assert.match(f.handoff(1), /Missing technical confirmation/);
      confirm("technical");
      f.commit();
    }
    const before = at(f.repo, "rev-parse", "HEAD");
    f.workspace("handoff", ["--path", f.work, "--dry-run"]);
    assert(!existsSync(f.work));
    assert.equal(at(f.repo, "rev-parse", "HEAD"), before);
    f.handoff();
    assert(!existsSync(join(f.work, "docs/project/changes/sample/plan.md")));
    assert.deepEqual(f.state("show", [], 0, "sample", f.work).state.tasks, {});
    assert.equal(
      f.state("show", [], 0, "sample", f.work).state.confirmations.plan,
      undefined,
    );
    assert.match(
      f.state("execute", [], 1, "sample", f.work),
      /Missing plan.md/,
    );
    f.put("docs/project/changes/sample/plan.md", "# Plan\n", f.work);
    if (size !== "xlarge")
      f.state("task-add", ["--title", "Implement"], 0, "sample", f.work);
    assert.match(
      f.state("execute", [], 1, "sample", f.work),
      /Missing .* confirmation/,
    );
    if (size !== "large") confirm("technical", f.work);
    confirm("plan", f.work);
    f.commit(f.work);
    assert(!existsSync(join(f.repo, "docs/project/changes/sample/plan.md")));
    assert.equal(f.state("show").state.confirmations.plan.summary, "Scope");
    f.state("execute", [], 0, "sample", f.work);
    if (size === "xlarge")
      assert.match(
        f.state(
          "verify",
          ["--result", "passed", "--summary", "Check children"],
          1,
          "sample",
          f.work,
        ),
        /child.*not closed/i,
      );
  });
}
test("Plan handoff permits pending delivery dependencies but execution still checks them", (t) => {
  const f = fixture(t);
  f.planning("upstream");
  f.state("create", [
    "--title",
    "Dependent plan",
    "--size",
    "medium",
    "--depends-on",
    "upstream",
  ]);
  for (const name of ["requirement", "technical"])
    f.put(`docs/project/changes/sample/${name}.md`, `# ${name}\n`);
  f.state("confirm", [
    "--phase",
    "requirement",
    "--summary",
    "Scope",
    "--source",
    "Fixture",
  ]);
  f.state("wait", ["--kind", "pause", "--summary", "Explicit pause"]);
  f.commit();
  assert.match(f.handoff(1), /Resolve the pause/);
  f.state("resume");
  f.commit();
  f.handoff();
  f.put("docs/project/changes/sample/plan.md", "# Plan\n", f.work);
  f.state("task-add", ["--title", "Implement"], 0, "sample", f.work);
  for (const phase of ["technical", "plan"])
    f.state(
      "confirm",
      ["--phase", phase, "--summary", "Scope", "--source", "Fixture"],
      0,
      "sample",
      f.work,
    );
  f.commit(f.work);
  assert.match(f.state("execute", [], 1, "sample", f.work), /closed|archived/);
});
test("target push failure and registration refusal preserve public routing and retry safely", (t) => {
  const f = fixture(t);
  f.planning();
  let allow = f.reject("change/sample");
  f.handoff(1);
  assert.equal(
    JSON.parse(
      at(f.remote, "show", "develop:docs/project/changes/sample/change.json"),
    ).branch,
    "develop",
  );
  allow();
  allow = f.reject("develop");
  f.handoff(1);
  assert.equal(
    JSON.parse(
      at(
        f.remote,
        "show",
        "change/sample:docs/project/changes/sample/change.json",
      ),
    ).branch,
    "change/sample",
  );
  allow();
  f.planning("other");
  f.handoff();
  assert.equal(
    at(f.remote, "rev-parse", "develop"),
    at(f.remote, "rev-parse", "change/sample"),
  );
  assert.equal(f.state("show", [], 0, "other").state.branch, "develop");
});
test("same Change edited during interrupted handoff is not overwritten", (t) => {
  const f = fixture(t);
  f.planning();
  const allow = f.reject("develop");
  f.handoff(1);
  allow();
  f.state("retitle", ["--title", "Changed requirements"]);
  f.commit();
  assert.match(f.handoff(1), /current planning input/);
  assert.equal(f.state("show").state.title, "Changed requirements");
});
test("failed commit is recoverable, unrelated dirty worktree and main index are preserved", (t) => {
  const f = fixture(t);
  f.planning();
  const hook = join(f.repo, ".git/hooks/pre-commit");
  writeFileSync(hook, "#!/bin/sh\nexit 1\n", { mode: 0o755 });
  f.handoff(1);
  rmSync(hook);
  f.put("unrelated.txt", "keep", f.work);
  assert.match(f.handoff(1), /unrelated local changes/);
  rmSync(join(f.work, "unrelated.txt"));
  f.put("staged.txt", "keep");
  at(f.repo, "add", "staged.txt");
  const result = f.handoff();
  assert.match(result.planningWorkspace, /left untouched/);
  assert.equal(at(f.repo, "diff", "--cached", "--name-only"), "staged.txt");
});
test("locate from detached or other worktree reports divergence and never resets local work", (t) => {
  const f = fixture(t);
  f.planning();
  f.handoff();
  f.put("local.txt", "local", f.work);
  at(f.work, "add", ".");
  at(f.work, "commit", "-m", "Local only");
  f.put("dirty.txt", "keep", f.work);
  let found = f.workspace("locate");
  assert.equal(found.ahead, 1);
  assert.equal(found.dirty, true);
  const head = at(f.work, "rev-parse", "HEAD");
  f.workspace("prepare");
  assert.equal(at(f.work, "rev-parse", "HEAD"), head);
  at(f.repo, "checkout", "--detach");
  found = f.workspace("locate");
  assert.equal(found.current.detached, true);
  assert.equal(found.worktree, f.work);
  assert.equal(found.session.binding, "unverified");
  assert.match(found.session.prompt, /实际 cwd/);
  at(f.work, "checkout", "--detach");
  found = f.workspace("locate");
  assert.equal(found.worktree, null);
  f.workspace("prepare", ["--path", join(f.root, "replacement")]);
  assert.equal(readFileSync(join(f.work, "dirty.txt"), "utf8"), "keep");
});
test("deleted remote cannot be revived by stale tracking refs; new clone can recreate worktree", (t) => {
  const f = fixture(t);
  f.planning();
  f.handoff();
  const clone = join(f.root, "new");
  at(f.root, "clone", "-b", "develop", f.remote, clone);
  const result = f.workspace(
    "prepare",
    ["--path", join(f.root, "new-work")],
    0,
    "sample",
    clone,
  );
  assert.equal(result.branch, "change/sample");
  at(f.repo, "push", "origin", "--delete", "change/sample");
  assert.match(f.workspace("prepare", [], 1), /Remote branch is missing/);
});
test("shared registration permits archived delivery merge without deleting other planning", (t) => {
  const f = fixture(t);
  f.planning();
  f.handoff();
  f.planning("other");
  const s = (cmd: string, opts: string[] = []) =>
    f.state(cmd, opts, 0, "sample", f.work);
  s("execute");
  s("task-start", ["--task", "T1"]);
  s("task-complete", ["--task", "T1", "--verification", "Fixture verified"]);
  f.commit(f.work);
  s("verify", ["--result", "passed", "--summary", "Verified"]);
  s("accept", [
    "--mode",
    "agent",
    "--summary",
    "Agent fixture acceptance",
    "--source",
    "Fixture evidence",
  ]);
  s("specs", ["--result", "not_needed", "--summary", "No lasting change"]);
  s("archive", ["--date", "2026-10-18", "--summary", "Archived"]);
  f.commit(f.work);
  at(f.work, "fetch", "origin", "develop");
  at(f.work, "merge", "--no-edit", "origin/develop");
  at(f.work, "push", "origin", "HEAD:develop");
  at(f.repo, "fetch", "origin", "develop");
  at(f.repo, "merge", "--ff-only", "origin/develop");
  at(f.repo, "push", "origin", "--delete", "change/sample");
  const found = f.workspace("locate");
  assert.equal(found.branch, "develop");
  assert.equal(found.writable, false);
  assert.equal(f.state("show").state.status, "completed");
  assert.equal(f.state("show", [], 0, "other").state.status, "active");
  assert(!existsSync(join(f.repo, "docs/project/changes/sample")));
});

test("prepare reports behind/diverged branches and prunable registrations without resetting them", (t) => {
  const f = fixture(t);
  f.planning();
  f.handoff();
  const actor = join(f.root, "actor");
  at(f.root, "clone", "-b", "change/sample", f.remote, actor);
  at(actor, "config", "user.name", "Actor");
  at(actor, "config", "user.email", "actor@example.invalid");
  f.put("remote.txt", "new", actor);
  f.commit(actor);
  let result = f.workspace("prepare");
  assert.equal(result.behind, 1);
  assert.equal(result.ahead, 0);
  f.put("local.txt", "local", f.work);
  at(f.work, "add", ".");
  at(f.work, "commit", "-m", "Local work");
  const before = at(f.work, "rev-parse", "HEAD");
  result = f.workspace("prepare");
  assert.equal(result.diverged, true);
  assert.equal(result.behind, 1);
  assert.equal(result.ahead, 1);
  assert.equal(at(f.work, "rev-parse", "HEAD"), before);
  const refs = at(f.repo, "show-ref");
  f.workspace("prepare", ["--dry-run"]);
  assert.equal(at(f.repo, "show-ref"), refs);
  rmSync(f.work, { recursive: true, force: true });
  result = f.workspace("locate");
  assert.match(result.diagnostics.join(" "), /unavailable/);
  assert.match(f.workspace("prepare", [], 1), /not writable/);
  assert.match(at(f.repo, "worktree", "list", "--porcelain"), /prunable/);
});

test("same Change prose edited after rejected registration requires review before retry", (t) => {
  const f = fixture(t);
  f.planning();
  const allow = f.reject("develop");
  f.handoff(1);
  allow();
  f.put(
    "docs/project/changes/sample/requirement.md",
    "# New scope without JSON changes",
  );
  f.commit();
  const prepared = at(f.work, "rev-parse", "HEAD");
  assert.match(f.handoff(1), /Planning directory changed/);
  assert.equal(at(f.work, "rev-parse", "HEAD"), prepared);
  assert.equal(
    JSON.parse(
      at(f.remote, "show", "develop:docs/project/changes/sample/change.json"),
    ).branch,
    "develop",
  );
});

test("parent closure checks the live registered child ref rather than a deleted remote's tracking cache", (t) => {
  const f = fixture(t);
  f.planning();
  f.handoff();
  f.state("cancel", ["--reason", "No longer needed"], 0, "sample", f.work);
  f.commit(f.work);
  const parent = (command: string, opts: string[] = [], expected = 0) =>
    f.state(command, opts, expected, "parent");
  parent("create", [
    "--title",
    "Parent",
    "--size",
    "xlarge",
    "--children",
    "sample",
  ]);
  for (const name of ["requirement", "technical", "plan"])
    f.put(`docs/project/changes/parent/${name}.md`, `# ${name}`);
  for (const phase of ["requirement", "technical", "plan"])
    parent("confirm", [
      "--phase",
      phase,
      "--summary",
      "Fixture confirmed",
      "--source",
      "Fixture instruction",
    ]);
  parent("execute");
  f.commit();
  at(f.repo, "push", "origin", "--delete", "change/sample");
  assert.match(
    parent("verify", ["--result", "passed", "--summary", "Verify children"], 1),
    /Remote branch is missing/,
  );
  assert.equal(parent("show").state.stage, "execution");
});

test("xlarge parents move to a closing branch after child delivery and cannot archive on collaboration", async (t) => {
  const f = fixture(t),
    child = { ...completedChange("child"), parent: "parent" };
  f.put(`${child.closure.archive.path}/change.json`, JSON.stringify(child));
  f.commit();
  const parent = (
    command: string,
    options: string[] = [],
    expected = 0,
    cwd = f.repo,
  ) => f.state(command, options, expected, "parent", cwd);
  parent("create", [
    "--title",
    "Parent",
    "--size",
    "xlarge",
    "--children",
    "child",
  ]);
  for (const phase of ["requirement", "technical", "plan"]) {
    f.put(`docs/project/changes/parent/${phase}.md`, "# Parent delivery");
    parent("confirm", [
      "--phase",
      phase,
      "--summary",
      "Parent scope",
      "--source",
      "Fixture confirmation",
    ]);
  }
  parent("execute");
  parent("verify", ["--result", "passed", "--summary", "Children integrated"]);
  parent("accept", [
    "--mode",
    "user",
    "--summary",
    "Accepted parent",
    "--source",
    "Fixture acceptance",
  ]);
  parent("specs", [
    "--result",
    "not_needed",
    "--summary",
    "No additional capability",
  ]);
  f.commit();
  assert.match(
    parent(
      "archive",
      ["--date", "2026-10-18", "--summary", "Parent delivery"],
      1,
    ),
    /independent closing branch/,
  );
  const path = join(f.root, "parent");
  f.workspace("handoff", ["--path", path], 0, "parent");
  parent(
    "archive",
    ["--date", "2026-10-18", "--summary", "Parent delivery"],
    0,
    path,
  );
  f.commit(path);
  at(
    f.repo,
    "merge",
    "--no-ff",
    at(path, "rev-parse", "HEAD"),
    "-m",
    "Change PR\n\nSpecTrail-Change: parent",
  );
  at(f.repo, "push", "origin", "develop");
  const env = await githubCli(
    { root: f.root, remote: f.remote, git: (args) => at(f.repo, ...args) },
    [
      {
        number: 1,
        title: "Parent delivery",
        url: "https://github.com/demo/work/pull/1",
        body: "Delivery\n\nSpecTrail-Change: parent",
        state: "merged",
        draft: false,
        head: {
          repositoryId: "1",
          branch: at(path, "branch", "--show-current"),
          commit: at(path, "rev-parse", "HEAD"),
        },
        base: {
          repositoryId: "1",
          branch: "develop",
          commit: at(f.repo, "rev-parse", "HEAD^1"),
        },
        mergeCommit: at(f.repo, "rev-parse", "HEAD"),
        updatedAt: "2026-10-25T00:00:00Z",
      },
    ],
  );
  const output = JSON.parse(
    execFileSync(
      process.execPath,
      [
        resolve(".agents/skills/spec-trail/scripts/integration.mjs"),
        "verify",
        "--repo",
        f.repo,
        "--change",
        "parent",
      ],
      { encoding: "utf8", env },
    ),
  );
  assert.equal(output.sourceIncluded, true);
  assert.ok(
    !at(f.repo, "diff", "--name-only", `${output.tip}^1`, output.tip).includes(
      child.closure.archive.path,
    ),
  );
});
