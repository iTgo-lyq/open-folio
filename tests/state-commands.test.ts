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
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const script = resolve(".agents/skills/spec-trail/scripts/change.mjs");
function fixture(t: import("node:test").TestContext) {
  const root = mkdtempSync(join(tmpdir(), "folio-state-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const git = (...args: string[]) =>
    execFileSync("git", args, {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  git("init", "-b", "main");
  git("config", "user.name", "State test");
  git("config", "user.email", "state@example.invalid");
  mkdirSync(join(root, "docs/project"), { recursive: true });
  writeFileSync(
    join(root, "docs/project/workflow.json"),
    JSON.stringify({ schemaVersion: 1, protectedBranches: ["main"] }),
  );
  git("add", ".");
  git("commit", "-m", "Initialize");
  git("switch", "-c", "codex/testing");
  const path = (id = "sample") =>
    join(root, `docs/project/changes/${id}/change.json`);
  const state = (id = "sample") => JSON.parse(readFileSync(path(id), "utf8"));
  const run = (
    command: string,
    options: string[] = [],
    expected = 0,
    id = "sample",
  ) => {
    const result = spawnSync(
      process.execPath,
      [script, command, "--repo", root, "--change", id, ...options],
      { encoding: "utf8" },
    );
    assert.equal(
      result.status,
      expected,
      `${command}: ${result.stdout}\n${result.stderr}`,
    );
    return expected === 0 ? JSON.parse(result.stdout) : result.stderr;
  };
  const create = (size = "small", id = "sample", extras: string[] = []) => {
    run("create", ["--title", "Example", "--size", size, ...extras], 0, id);
    for (const name of ["requirement", "technical", "plan"])
      writeFileSync(
        join(root, `docs/project/changes/${id}/${name}.md`),
        `# ${name}\n`,
      );
  };
  const begin = () => {
    run("task-add", ["--title", "Implement"]);
    run("execute");
    run("task-start", ["--task", "T1"]);
  };
  const plan = (body: string) =>
    writeFileSync(join(root, "docs/project/changes/sample/plan.md"), body);
  const confirm = () => {
    for (const phase of ["requirement", "technical", "plan"])
      run("confirm", [
        "--phase",
        phase,
        "--summary",
        "Fixture confirmation",
        "--source",
        "Test fixture",
      ]);
  };
  const done = () =>
    run("task-complete", [
      "--task",
      "T1",
      "--verification",
      "Actual checks passed",
    ]);
  const verify = () =>
    run("verify", ["--result", "passed", "--summary", "Verified"]);
  const accept = (mode = "agent") =>
    run("accept", [
      "--mode",
      mode,
      "--summary",
      "Accepted",
      "--source",
      "Explicit user instruction",
    ]);
  const archive = () => {
    run("specs", ["--result", "not_needed", "--summary", "No lasting change"]);
    return run("archive", ["--date", "2026-10-04", "--summary", "Archived"]);
  };
  const commit = () => {
    git("add", ".");
    git("commit", "-m", "State checkpoint");
  };
  return {
    root,
    git,
    path,
    state,
    run,
    create,
    begin,
    plan,
    confirm,
    done,
    verify,
    accept,
    archive,
    commit,
  };
}

test("semantic small lifecycle writes ordered ISO timestamps, preserves evidence and archives the directory", (t) => {
  const f = fixture(t);
  f.create();
  f.begin();
  f.done();
  f.commit();
  f.verify();
  f.accept();
  const before = f.state(),
    archived = f.archive();
  assert.equal(archived.state.status, "completed");
  assert(!existsSync(f.path()));
  assert(
    existsSync(
      join(f.root, archived.path.replace("change.json", "requirement.md")),
    ),
  );
  assert.deepEqual(archived.state.tasks, before.tasks);
  const times = Object.values(archived.state.closure).map(
    (step: any) => step.at,
  );
  times.forEach((at) =>
    assert.match(at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
  );
  assert.deepEqual(
    times.map(Date.parse),
    times.map(Date.parse).toSorted((a, b) => a - b),
  );
  const original = readFileSync(join(f.root, archived.path), "utf8");
  f.run("wait", ["--kind", "pause", "--summary", "No"], 1);
  f.run("archive", ["--date", "2026-10-04", "--summary", "Again"], 1);
  assert.equal(readFileSync(join(f.root, archived.path), "utf8"), original);
});

test("medium/large confirmations, repair tasks and explicit acceptance preserve completed work", (t) => {
  for (const size of ["medium", "large"]) {
    const f = fixture(t);
    f.create(size);
    f.run("task-add", ["--title", "Implement"]);
    f.run("execute", [], 1);
    for (const phase of ["requirement", "technical", "plan"])
      f.run("confirm", [
        "--phase",
        phase,
        "--summary",
        "User confirmed",
        "--source",
        "Conversation",
      ]);
    f.run("execute");
    f.run("task-start", ["--task", "T1"]);
    f.done();
    f.commit();
    f.verify();
    f.run(
      "accept",
      ["--mode", "agent", "--summary", "No", "--source", "Agent"],
      1,
    );
    f.run("wait", ["--kind", "confirmation", "--summary", "Await user"]);
    f.run(
      "accept",
      ["--mode", "user", "--summary", "Yes", "--source", "User"],
      1,
    );
    const completed = f.state().tasks.T1;
    f.run("rework", [
      "--stage",
      "execution",
      "--reason",
      "User correction",
      "--approach",
      "Append fix",
    ]);
    assert.deepEqual(f.state().closure, {});
    assert(!f.state().waitingFor);
    f.run("task-start", ["--task", "T1"], 1);
    f.run("task-add", ["--title", "Repair"]);
    f.run("task-start", ["--task", "T2"]);
    f.run("task-complete", [
      "--task",
      "T2",
      "--verification",
      "Repair verified",
    ]);
    assert.deepEqual(f.state().tasks.T1, completed);
    f.verify();
    f.accept("user");
    f.archive();
  }
});

test("default scheduling enforces numeric serial order for every ordinary size", (t) => {
  for (const size of ["small", "medium", "large"]) {
    const f = fixture(t);
    f.create(size);
    for (const id of ["T10", "T2", "T1"])
      f.run("task-add", ["--task", id, "--title", id]);
    if (size !== "small") f.confirm();
    f.run("execute");
    const before = readFileSync(f.path(), "utf8"),
      index = f.git("ls-files", "--stage");
    assert.match(f.run("task-start", ["--task", "T2"], 1), /T1/);
    assert.match(f.run("task-start", ["--task", "T10", "--dry-run"], 1), /T1/);
    assert.equal(readFileSync(f.path(), "utf8"), before);
    assert.equal(f.git("ls-files", "--stage"), index);
    f.run("task-block", ["--task", "T1", "--reason", "Waiting for input"]);
    f.run("task-start", ["--task", "T2"], 1);
    for (const id of ["T1", "T2", "T10"]) {
      f.run("task-start", ["--task", id]);
      f.run("task-complete", [
        "--task",
        id,
        "--verification",
        "Fixture result",
      ]);
    }
    f.verify();
    f.accept(size === "small" ? "agent" : "user");
    assert.equal(f.archive().state.status, "completed");
  }
});

test("explicit parallel order overrides the default and completion rechecks changed predecessors", (t) => {
  const f = fixture(t);
  f.create("medium");
  for (const id of ["T1", "T2"])
    f.run("task-add", ["--task", id, "--title", id]);
  f.confirm();
  const parallel =
    "## 执行顺序\n\n| 任务 | 前置任务 |\n| --- | --- |\n| T1 | 无 |\n| T2 | 无 |\n";
  f.plan(parallel);
  f.run("execute");
  f.run("task-start", ["--task", "T2"]);
  f.run("task-start", ["--task", "T1"]);
  assert.equal(f.state().tasks.T1.status, "doing");
  assert.equal(f.state().tasks.T2.status, "doing");
  f.plan(parallel.replace("| T2 | 无 |", "| T2 | T1 |"));
  const before = readFileSync(f.path(), "utf8");
  f.run(
    "task-complete",
    ["--task", "T2", "--verification", "Premature completion"],
    1,
  );
  assert.equal(readFileSync(f.path(), "utf8"), before);
  f.done();
  f.run("task-complete", [
    "--task",
    "T2",
    "--verification",
    "After prerequisite",
  ]);
  f.verify();
});

test("invalid explicit orders block execution and every closure step without writing state", (t) => {
  const f = fixture(t);
  f.create("medium");
  f.run("task-add", ["--title", "Implement"]);
  f.confirm();
  const good =
    "## 执行顺序\n\n| 任务 | 前置任务 |\n| --- | --- |\n| T1 | 无 |\n";
  const invalid = [
    good + good,
    good.replace("| --- | --- |\n", ""),
    good.replace("| T1 | 无 |", "| T1 | T1 |"),
    good.replace("T1 | 无", "T2 | 无"),
  ];
  const original = readFileSync(f.path(), "utf8");
  for (const body of invalid) {
    f.plan(body);
    f.run("execute", [], 1);
    assert.equal(readFileSync(f.path(), "utf8"), original);
  }
  f.plan(good);
  f.run("execute");
  f.plan(invalid[0]);
  const execution = readFileSync(f.path(), "utf8");
  f.run("task-start", ["--task", "T1"], 1);
  assert.equal(readFileSync(f.path(), "utf8"), execution);
  f.plan(good);
  f.run("task-start", ["--task", "T1"]);
  f.done();
  const checked = (command: string, options: string[], action: () => void) => {
    f.plan(invalid[0]);
    const before = readFileSync(f.path(), "utf8"),
      index = f.git("ls-files", "--stage");
    f.run(command, options, 1);
    assert.equal(readFileSync(f.path(), "utf8"), before);
    assert.equal(f.git("ls-files", "--stage"), index);
    f.plan(good);
    action();
  };
  checked("verify", ["--result", "passed", "--summary", "Bad order"], f.verify);
  checked(
    "accept",
    ["--mode", "user", "--summary", "Bad order", "--source", "Fixture"],
    () => f.accept("user"),
  );
  checked("specs", ["--result", "not_needed", "--summary", "Bad order"], () =>
    f.run("specs", ["--result", "not_needed", "--summary", "Fixture"]),
  );
  checked("archive", ["--date", "2026-10-09", "--summary", "Bad order"], () => {
    assert(existsSync(f.path()));
    assert(!existsSync(join(f.root, "docs/project/archive/2026-10-09-sample")));
    f.run("archive", ["--date", "2026-10-09", "--summary", "Valid order"]);
  });
});

test("serial scheduling checks earlier ancestors even when an intermediate task is already done", (t) => {
  const f = fixture(t);
  f.create();
  for (const id of ["T1", "T2", "T3"])
    f.run("task-add", ["--task", id, "--title", id]);
  f.run("execute");
  const state = f.state();
  state.tasks.T2.status = "done";
  writeFileSync(f.path(), JSON.stringify(state));
  assert.match(f.run("task-start", ["--task", "T3"], 1), /T1/);
  assert.equal(f.state().tasks.T3.status, "todo");
});

test("failed operations, dry runs, locks and conflicting files leave source bytes unchanged", (t) => {
  const f = fixture(t);
  f.create();
  const before = readFileSync(f.path(), "utf8");
  f.run("create", ["--title", "Overwrite", "--size", "small"], 1);
  f.run("task-add", ["--title", "No", "--task", "__proto__"], 1);
  f.run("task-add", ["--title", "No", "--unknown", "value"], 1);
  f.run("verify", ["--result", "passed", "--summary", "Skip"], 1);
  f.run("task-add", ["--title", "Plan only", "--dry-run"]);
  assert.equal(readFileSync(f.path(), "utf8"), before);
  mkdirSync(join(f.root, ".git/spec-trail-state.lock"));
  f.run("task-add", ["--title", "Contended"], 1);
  assert(existsSync(join(f.root, ".git/spec-trail-state.lock")));
  rmSync(join(f.root, ".git/spec-trail-state.lock"), { recursive: true });
  f.git("switch", "-c", "codex/wrong");
  f.run("task-add", ["--title", "Wrong owner"], 1);
  f.git("switch", "main");
  f.run("task-add", ["--title", "Protected"], 1);
  assert.equal(readFileSync(f.path(), "utf8"), before);
});

test("closure remains strict about future clocks and required steps; no precision tolerance", (t) => {
  const f = fixture(t);
  f.create();
  f.begin();
  f.done();
  f.verify();
  f.run("specs", ["--result", "synced", "--summary", "Skip acceptance"], 1);
  const state = f.state();
  state.closure.verification.at = "2999-01-01T00:00:00.080Z";
  writeFileSync(f.path(), JSON.stringify(state));
  const before = readFileSync(f.path(), "utf8");
  f.run(
    "accept",
    ["--mode", "agent", "--summary", "Accept", "--source", "Policy"],
    1,
  );
  assert.equal(readFileSync(f.path(), "utf8"), before);
});

test("retry only repairs an uncommitted done task; waiting, blocking, failed verification and cancellation are explicit", (t) => {
  const f = fixture(t);
  f.create();
  f.begin();
  f.commit();
  f.done();
  const staged = f.state();
  staged.title = "Staged title";
  writeFileSync(f.path(), JSON.stringify(staged));
  f.git("add", "docs/project/changes/sample/change.json");
  writeFileSync(
    f.path(),
    JSON.stringify({ ...staged, title: "Unstaged title" }),
  );
  const hook = join(f.root, ".git/hooks/pre-commit");
  writeFileSync(hook, "#!/bin/sh\nexit 1\n", { mode: 0o755 });
  assert.throws(() => f.git("commit", "-m", "Rejected checkpoint"));
  rmSync(hook);
  f.run("task-retry", ["--task", "T1"]);
  const recoveredIndex = JSON.parse(
    f.git("show", ":docs/project/changes/sample/change.json"),
  );
  assert.equal(recoveredIndex.tasks.T1.status, "doing");
  assert(!recoveredIndex.tasks.T1.verification);
  assert.equal(recoveredIndex.title, "Staged title");
  assert.equal(f.state().title, "Unstaged title");
  assert.equal(f.state().tasks.T1.status, "doing");
  assert(!f.state().tasks.T1.verification);
  f.run("task-block", ["--task", "T1", "--reason", "External data missing"]);
  f.run("task-complete", ["--task", "T1", "--verification", "No"], 1);
  f.run("wait", ["--kind", "dependency", "--summary", "Upstream"]);
  f.run("task-start", ["--task", "T1"], 1);
  f.run("resume");
  f.run("task-start", ["--task", "T1"]);
  f.done();
  f.commit();
  f.run("task-retry", ["--task", "T1"], 1);
  f.run("verify", ["--result", "failed", "--summary", "Integration failed"]);
  f.run(
    "accept",
    ["--mode", "agent", "--summary", "No", "--source", "Policy"],
    1,
  );
  f.run("rework", [
    "--stage",
    "requirement",
    "--reason",
    "Scope changed",
    "--approach",
    "Reconsider",
  ]);
  f.run("cancel", ["--reason", "User cancelled"]);
  const before = readFileSync(f.path(), "utf8");
  f.run("resume", [], 1);
  f.run("create", ["--title", "Other", "--size", "small"], 1, "other");
  assert.equal(readFileSync(f.path(), "utf8"), before);
});

test("archive collision and symlink inputs do not overwrite files", (t) => {
  const f = fixture(t);
  f.create();
  f.begin();
  f.done();
  f.verify();
  f.accept();
  f.run("specs", ["--result", "synced", "--summary", "Synced"]);
  mkdirSync(join(f.root, "docs/project/archive/2026-10-04-sample"), {
    recursive: true,
  });
  const before = readFileSync(f.path(), "utf8");
  f.run("archive", ["--date", "2026-10-04", "--summary", "Collision"], 1);
  f.run("archive", ["--date", "2026-02-30", "--summary", "Bad date"], 1);
  assert.equal(readFileSync(f.path(), "utf8"), before);
  const outside = join(f.root, "outside.json");
  writeFileSync(outside, before);
  rmSync(f.path());
  symlinkSync(outside, f.path());
  f.run("show", [], 1);
  assert.equal(readFileSync(outside, "utf8"), before);
  rmSync(f.path());
  symlinkSync(join(f.root, "does-not-exist"), f.path());
  f.run("show", [], 1);
});

test("preview association command preserves unrelated state and enforces configuration and output paths", (t) => {
  const f = fixture(t);
  f.create();
  const entries = join(f.root, "entries.json");
  const entry = {
    id: "page",
    title: "Page",
    kind: "page",
    artifact: {
      type: "git",
      path: "packages/prototype/preview/page",
      sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], {
        cwd: f.root,
        encoding: "utf8",
      }).trim(),
    },
    devices: ["mobile"],
  };
  writeFileSync(entries, JSON.stringify([entry]));
  f.run("previews-set", ["--file", entries], 1);
  writeFileSync(
    join(f.root, "docs/project/workflow.json"),
    JSON.stringify({
      schemaVersion: 1,
      protectedBranches: ["main"],
      prototype: {
        status: "enabled",
        packagePath: "packages/prototype",
        decision: { at: new Date().toISOString(), summary: "User agreed" },
      },
    }),
  );
  f.run("previews-set", ["--file", entries], 1);
  mkdirSync(join(f.root, entry.artifact.path), { recursive: true });
  writeFileSync(
    join(f.root, entry.artifact.path, "index.html"),
    "<h1>Page</h1>",
  );
  const before = f.state();
  f.run("previews-set", ["--file", entries]);
  assert.deepEqual(f.state(), { ...before, previews: [entry] });
  writeFileSync(entries, JSON.stringify([{ ...entry, devices: ["watch"] }]));
  f.run("previews-set", ["--file", entries], 1);
  f.begin();
  f.done();
  f.verify();
  f.accept();
  const result = f.archive();
  assert.match(result.next, /archive.mjs/);
});

test("execution requires a published archived dependency already integrated in the branch", (t) => {
  const f = fixture(t);
  const remote = join(f.root, "remote.git");
  execFileSync("git", ["init", "--bare", remote], { stdio: "ignore" });
  f.git("remote", "add", "origin", remote);
  f.create();
  f.begin();
  f.done();
  f.verify();
  f.accept();
  f.archive();
  // Keep the local bare remote out of the author worktree index.
  writeFileSync(join(f.root, ".gitignore"), "remote.git/\n");
  f.commit();
  f.create("small", "next", ["--depends-on", "sample"]);
  f.run("task-add", ["--title", "Use prerequisite"], 0, "next");
  f.run("execute", [], 1, "next");
  f.git("push", "-u", "origin", "HEAD");
  f.run("execute", [], 0, "next");
  assert.equal(f.state("next").stage, "execution");
});

test("squash integration accepts explicit delivery evidence without inventing ancestry", (t) => {
  const f = fixture(t);
  const remote = join(f.root, "remote.git");
  execFileSync("git", ["init", "--bare", remote], { stdio: "ignore" });
  f.git("remote", "add", "origin", remote);
  f.create();
  f.begin();
  f.done();
  f.verify();
  f.accept();
  f.archive();
  writeFileSync(join(f.root, ".gitignore"), "remote.git/\n");
  writeFileSync(join(f.root, "delivery.txt"), "upstream delivery\n");
  f.commit();
  f.git("push", "-u", "origin", "HEAD");
  const sourceCommit = f.git("rev-parse", "HEAD");
  f.git("switch", "main");
  f.git("merge", "--squash", "codex/testing");
  f.git("commit", "-m", "Squash accepted upstream");
  f.git("switch", "-c", "codex/downstream");
  f.create("small", "next", ["--depends-on", "sample"]);
  f.run("task-add", ["--title", "Use upstream"], 0, "next");
  f.run("execute", [], 1, "next");
  const note = `Verified delivery.txt and archived sample after squash ${f.git("rev-parse", "HEAD")}`;
  const result = f.run("execute", ["--availability-note", note], 0, "next");
  assert.equal(result.state.stage, "execution");
  assert.equal(result.availability[0].sourceCommit, sourceCommit);
  assert.equal(result.availability[0].evidence, note);
});
