import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const installer = fileURLToPath(new URL("../scripts/install-hook.mjs", import.meta.url));
const checkCommand = 'node "$(git rev-parse --show-toplevel)/.agents/skills/spec-trail/setup/scripts/pre-commit.js"';
const validWorkflow = { schemaVersion: 1, protectedBranches: ["main"] };
const invalidWorkflow = { schemaVersion: 1, protectedBranches: [] };
const at = "2024-02-29T12:30:00.125+08:00";
const validChange = {
  schemaVersion: 1, id: "feature", title: "Test feature", size: "medium", status: "active", stage: "execution",
  branch: "change/feature", parent: "parent", children: ["child"], dependsOn: ["dependency"],
  confirmations: {
    requirement: { at, summary: "Confirmed", source: "User" },
    technical: { at, summary: "Confirmed" }, plan: { at, summary: "Confirmed" },
    merge: { at, summary: "Confirmed", sourceCommit: "abcdef0", targetCommit: "0123456", baseCommit: "aaaaaaa" },
  },
  tasks: { T1: { title: "Implement", status: "done", branch: "task/feature/T1", verification: "Passed", commitTitle: "Implement feature" } },
  waitingFor: { kind: "confirmation", summary: "Await review" },
  rework: { at, reason: "Update", approach: "Revise" },
  closure: {
    verification: { at, summary: "Passed", result: "passed" },
    acceptance: { at, summary: "Accepted", result: "accepted", source: "User" },
    specs: { at, summary: "No change", result: "not_needed" },
    archive: { at, summary: "Archived", result: "done", path: "docs/project/archive/2026-10-02-feature" },
  },
};

function sandbox(t) {
  const base = mkdtempSync(join(tmpdir(), "spec-trail-hook-"));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const globalConfig = join(base, "gitconfig");
  writeFileSync(globalConfig, "");
  const env = { ...process.env, GIT_CONFIG_GLOBAL: globalConfig, GIT_CONFIG_NOSYSTEM: "1" };
  for (const name of ["GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE", "GIT_COMMON_DIR"]) delete env[name];
  function run(cmd, args, cwd, expected = 0) {
    const result = spawnSync(cmd, args, { cwd, env, encoding: "utf8" });
    if (result.error) throw result.error;
    assert.equal(result.status, expected, `${cmd} ${args.join(" ")}\n${result.stdout}\n${result.stderr}`);
    return `${result.stdout}${result.stderr}`;
  }
  const git = (repo, args, expected = 0) => run("git", ["-C", repo, ...args], base, expected);
  function identity(repo) {
    git(repo, ["config", "user.name", "SpecTrail test"]);
    git(repo, ["config", "user.email", "spec-trail-test@example.invalid"]);
  }
  function makeRepo(name) {
    const repo = join(base, name);
    mkdirSync(repo);
    git(repo, ["init", "--initial-branch=main"]);
    identity(repo);
    return repo;
  }
  const install = (repo, expected = 0) => run(process.execPath, [installer, repo], base, expected);
  function write(repo, relative, value) {
    const path = join(repo, relative);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, typeof value === "string" ? value : `${JSON.stringify(value)}\n`);
  }
  function commit(repo) {
    git(repo, ["add", "."]);
    git(repo, ["commit", "-m", "Initialize hook"]);
  }
  function clone(repo, name) {
    const target = join(base, name);
    run("git", ["clone", "--quiet", repo, target], base);
    identity(target);
    return target;
  }
  return { base, run, git, makeRepo, install, write, commit, clone };
}

test("thin hook invokes the skill script after clone activation without dependencies", (t) => {
  const s = sandbox(t);
  const repo = s.makeRepo("original project's checkout");
  s.install(repo);
  s.install(repo);
  assert.ok(!existsSync(join(repo, "package.json")));
  assert.ok(!existsSync(join(repo, "package-lock.json")));
  assert.ok(!existsSync(join(repo, "scripts")));
  s.write(repo, "docs/project/workflow.json", validWorkflow);
  s.write(repo, "note.txt", "Initial note\n");
  s.commit(repo);
  const cloned = s.clone(repo, "fresh clone's checkout");
  s.git(cloned, ["config", "--get", "core.hooksPath"], 1);
  s.git(cloned, ["config", "--local", "core.hooksPath", ".githooks"]);
  const head = s.git(cloned, ["rev-parse", "HEAD"]).trim();
  s.write(cloned, "docs/project/workflow.json", invalidWorkflow);
  s.git(cloned, ["add", "docs/project/workflow.json"]);
  s.write(cloned, "docs/project/workflow.json", validWorkflow);
  assert.match(s.git(cloned, ["commit", "-m", "Reject invalid staged configuration"], 1), /\/protectedBranches/);
  assert.equal(s.git(cloned, ["rev-parse", "HEAD"]).trim(), head);
  s.write(cloned, "docs/project/workflow.json", { ...validWorkflow, protectedBranches: ["main", "release"] });
  s.git(cloned, ["add", "docs/project/workflow.json"]);
  s.write(cloned, "docs/project/workflow.json", invalidWorkflow);
  s.git(cloned, ["commit", "-m", "Accept valid index despite invalid working copy"]);
  assert.deepEqual(JSON.parse(s.git(cloned, ["show", "HEAD:docs/project/workflow.json"])).protectedBranches, ["main", "release"]);
  s.git(cloned, ["add", "docs/project/workflow.json"]);
  s.write(cloned, "note.txt", "Updated note\n");
  s.git(cloned, ["add", "note.txt"]);
  s.git(cloned, ["commit", "--only", "note.txt", "-m", "Partial commit excludes other staged state"]);
  s.git(cloned, ["commit", "-m", "Remaining invalid index still rejected"], 1);
  s.git(cloned, ["restore", "--staged", "docs/project/workflow.json"]);
  s.git(cloned, ["restore", "docs/project/workflow.json"]);
  const worktree = join(s.base, "linked worktree");
  s.git(cloned, ["worktree", "add", "--detach", worktree]);
  s.write(worktree, "docs/project/workflow.json", invalidWorkflow);
  s.git(worktree, ["add", "docs/project/workflow.json"]);
  s.git(worktree, ["commit", "-m", "Reject invalid worktree state"], 1);
  assert.equal(s.git(cloned, ["status", "--porcelain"]).trim(), "");
});

test("field rules reject invalid workflow and Change state with precise paths", (t) => {
  const s = sandbox(t);
  const repo = s.makeRepo("field rules");
  s.install(repo);
  s.write(repo, "docs/project/workflow.json", validWorkflow);
  s.write(repo, "docs/project/changes/feature/change.json", validChange);
  s.commit(repo);
  const head = s.git(repo, ["rev-parse", "HEAD"]).trim();
  for (const [value, field] of [
    [null, "/"], [{ ...validWorkflow, schemaVersion: "1" }, "/schemaVersion"],
    [invalidWorkflow, "/protectedBranches"], [{ ...validWorkflow, protectedBranches: ["main", "main"] }, "/protectedBranches"],
    [{ ...validWorkflow, protectedBranches: ["*"] }, "/protectedBranches/0"], ["{ invalid JSON", "/"],
  ]) {
    s.write(repo, "docs/project/workflow.json", value);
    s.git(repo, ["add", "docs/project/workflow.json"]);
    assert.ok(s.git(repo, ["commit", "-m", "Invalid workflow"], 1).includes(`: ${field}:`));
  }
  s.write(repo, "docs/project/workflow.json", validWorkflow);
  s.git(repo, ["add", "docs/project/workflow.json"]);
  const cases = [
    [(v) => delete v.title, "/title"], [(v) => v.title = " \n ", "/title"],
    [(v) => v.size = "huge", "/size"], [(v) => v.stage = "unknown", "/stage"],
    [(v) => v.branch = "bad branch", "/branch"], [(v) => v.id = "Bad_ID", "/id"],
    [(v) => v.dependsOn = ["dependency", "dependency"], "/dependsOn"], [(v) => v.children = null, "/children"],
    [(v) => v["unknown/key~"] = true, "/unknown~1key~0"],
    [(v) => v.tasks.T0 = v.tasks.T1, "/tasks/T0"], [(v) => v.tasks.T1.status = "blocked", "/tasks/T1/reason"],
    [(v) => v.tasks.T1.reason = "", "/tasks/T1/reason"], [(v) => v.status = "cancelled", "/cancellation"],
    [(v) => v.confirmations = [], "/confirmations"], [(v) => v.confirmations.merge.sourceCommit = "ABCDEF0", "/confirmations/merge/sourceCommit"],
    [(v) => v.closure.verification.extra = true, "/closure/verification/extra"],
    [(v) => v.closure.acceptance.result = "passed", "/closure/acceptance/result"],
    [(v) => delete v.closure.archive.path, "/closure/archive/path"],
    [(v) => v.waitingFor.kind = "other", "/waitingFor/kind"],
    ...["2023-02-29T12:00:00Z", "2100-02-29T12:00:00Z", "2024-04-31T12:00:00Z", "2024-01-01T24:00:00Z",
      "2024-01-01T12:60:00Z", "2024-01-01T12:00:00+24:00", "2024-01-01T12:00:00", "2024-01-01T12:00:60Z"]
      .map((value) => [(v) => v.confirmations.requirement.at = value, "/confirmations/requirement/at"]),
  ];
  for (const [mutate, field] of cases) {
    const value = structuredClone(validChange);
    mutate(value);
    s.write(repo, "docs/project/changes/feature/change.json", value);
    s.git(repo, ["add", "docs/project/changes/feature/change.json"]);
    const output = s.git(repo, ["commit", "-m", "Invalid Change"], 1);
    assert.ok(output.includes(`docs/project/changes/feature/change.json: ${field}:`), output);
    assert.equal(s.git(repo, ["rev-parse", "HEAD"]).trim(), head);
  }
  const valid = structuredClone(validChange);
  valid.tasks.T1.status = "blocked";
  valid.tasks.T1.reason = "Await a dependency";
  valid.status = "cancelled";
  valid.cancellation = { at: "2016-12-31T23:59:60Z", reason: "Cancelled" };
  valid.confirmations.requirement.at = "2000-02-29T00:00:00Z";
  s.write(repo, "docs/project/changes/feature/change.json", valid);
  s.git(repo, ["add", "docs/project/changes/feature/change.json"]);
  s.git(repo, ["commit", "-m", "Valid optional and conditional fields"]);
});

test("archive renames are checked and deletions need no validation", (t) => {
  const s = sandbox(t);
  const repo = s.makeRepo("renames and deletions");
  s.install(repo);
  const before = "docs/project/changes/feature/change.json";
  const after = "docs/project/archive/2026-10-02-feature/change.json";
  s.write(repo, before, validChange);
  s.commit(repo);
  mkdirSync(dirname(join(repo, after)), { recursive: true });
  renameSync(join(repo, before), join(repo, after));
  s.write(repo, after, { ...validChange, status: "invalid" });
  s.git(repo, ["add", "-A"]);
  assert.match(s.git(repo, ["commit", "-m", "Invalid archive rename"], 1), /archive\/2026-10-02-feature\/change\.json: \/status/);
  s.write(repo, after, validChange);
  s.git(repo, ["add", after]);
  s.git(repo, ["commit", "-m", "Valid rename"]);
  s.git(repo, ["rm", after]);
  s.git(repo, ["commit", "-m", "Delete state"]);
});

test("existing hook manager and ESM package remain unchanged", (t) => {
  const s = sandbox(t);
  const repo = s.makeRepo("existing ESM project");
  const hook = join(repo, ".hooks/pre-commit");
  mkdirSync(dirname(hook));
  const original = "#!/bin/sh\nset -e\nprintf 'existing-check\\n' >&2\n";
  writeFileSync(hook, original);
  chmodSync(hook, 0o755);
  s.git(repo, ["config", "core.hooksPath", ".hooks"]);
  const pkg = '{"type":"module","scripts":{"prepare":"existing-command","build":"existing-build"}}\n';
  s.write(repo, "package.json", pkg);
  s.install(repo, 2);
  assert.equal(readFileSync(hook, "utf8"), original);
  writeFileSync(hook, `${original}${checkCommand}\n`);
  s.install(repo);
  assert.equal(readFileSync(join(repo, "package.json"), "utf8"), pkg);
  assert.equal(s.git(repo, ["config", "--get", "core.hooksPath"]).trim(), ".hooks");
  s.write(repo, "docs/project/workflow.json", validWorkflow);
  s.commit(repo);
  s.write(repo, "docs/project/workflow.json", invalidWorkflow);
  s.git(repo, ["add", "docs/project/workflow.json"]);
  assert.match(s.git(repo, ["commit", "-m", "Existing hook plus native ESM validation"], 1), /existing-check/);
});

test("other default hooks and modified tracked hooks are preserved", (t) => {
  const s = sandbox(t);
  const repo = s.makeRepo("existing default hooks");
  const hook = join(repo, ".git/hooks/pre-push");
  const body = "#!/bin/sh\nexit 0\n";
  writeFileSync(hook, body);
  chmodSync(hook, 0o755);
  s.install(repo, 2);
  assert.equal(readFileSync(hook, "utf8"), body);
  s.git(repo, ["config", "--get", "core.hooksPath"], 1);
  const modified = "#!/bin/sh\nprintf 'custom tracked hook\\n'\n";
  s.write(repo, ".githooks/pre-commit", modified);
  s.install(repo, 2);
  assert.equal(readFileSync(join(repo, ".githooks/pre-commit"), "utf8"), modified);
  const emptyConfig = s.makeRepo("explicit empty hook configuration");
  s.git(emptyConfig, ["config", "core.hooksPath", ""]);
  s.install(emptyConfig, 2);
  assert.equal(s.git(emptyConfig, ["config", "--get", "core.hooksPath"]).trim(), "");
});
