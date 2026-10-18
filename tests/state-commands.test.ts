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
const workspaceScript = resolve(
  ".agents/skills/spec-trail/scripts/workspace.mjs",
);
function fixture(
  t: import("node:test").TestContext,
  collaborationBranch = "develop",
) {
  const directory = mkdtempSync(join(tmpdir(), "folio-state-")),
    planning = join(directory, "repo"),
    remote = join(directory, "remote.git");
  let root = planning;
  mkdirSync(planning);
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const at = (cwd: string, ...args: string[]) =>
    execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  const git = (...args: string[]) => at(root, ...args);
  at(directory, "init", "--bare", remote);
  git("init", "-b", collaborationBranch);
  git("remote", "add", "origin", remote);
  git("config", "user.name", "State test");
  git("config", "user.email", "state@example.invalid");
  mkdirSync(join(root, "docs/project"), { recursive: true });
  writeFileSync(
    join(root, "docs/project/workflow.json"),
    JSON.stringify({
      schemaVersion: 2,
      collaborationBranch,
      protectedBranches: ["main"],
    }),
  );
  git("add", ".");
  git("commit", "-m", "Initialize");
  git("branch", "main");
  git("push", "-u", "origin", collaborationBranch);
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
    handoff();
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
  const commit = (push = true) => {
    git("add", ".");
    git("commit", "-m", "State checkpoint");
    if (push) git("push", "origin", "HEAD");
  };
  const handoff = (expected = 0, id = "sample", extras: string[] = []) => {
    assert.equal(root, planning, "Handoff starts from the planning workspace");
    if (git("status", "--porcelain")) commit();
    const work = join(directory, id);
    const result = spawnSync(
      process.execPath,
      [
        workspaceScript,
        "handoff",
        "--repo",
        planning,
        "--change",
        id,
        "--path",
        work,
        ...extras,
      ],
      { encoding: "utf8" },
    );
    assert.equal(result.status, expected, result.stdout + result.stderr);
    if (expected) return result.stderr;
    assert.equal(at(planning, "branch", "--show-current"), collaborationBranch);
    assert.equal(
      at(remote, "rev-parse", collaborationBranch),
      at(remote, "rev-parse", `change/${id}`),
    );
    root = work;
    return JSON.parse(result.stdout);
  };
  return {
    get root() {
      return root;
    },
    planning,
    remote,
    common: join(planning, ".git"),
    at,
    handoff,
    usePlanning: () => {
      root = planning;
    },
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

test("follow-up registration requires a published closed predecessor and stays independent of dependencies", (t) => {
  const f = fixture(t);
  const closed = (
    id: string,
    followUpOf?: string,
    patch: Record<string, unknown> = {},
  ) => {
    const at = "2026-10-01T00:00:00.000Z";
    const path = `docs/project/archive/2026-10-01-${id}`;
    const state = {
      schemaVersion: 1,
      id,
      title: id,
      branch: `change/${id}`,
      size: "small",
      status: "completed",
      stage: "close",
      confirmations: {},
      tasks: { T1: { title: "完成", status: "done" } },
      closure: {
        verification: { at, summary: "通过", result: "passed" },
        acceptance: { at, summary: "验收", result: "accepted" },
        specs: { at, summary: "同步", result: "synced" },
        archive: { at, summary: "归档", result: "done", path },
      },
      ...(followUpOf ? { followUpOf } : {}),
      ...patch,
    };
    mkdirSync(join(f.root, path), { recursive: true });
    writeFileSync(join(f.root, path, "change.json"), JSON.stringify(state));
    return join(f.root, path);
  };
  closed("first");
  closed("second", "first", { followUpTitle: "完善技术方案问询机制" });
  closed("loop-a", "loop-b");
  closed("loop-b", "loop-a");
  const confirmation = { at: "2026-10-01T00:00:00.000Z", summary: "确认" };
  const confirmations = {
    requirement: confirmation,
    technical: confirmation,
    plan: confirmation,
  };
  closed("missing-confirm", undefined, { size: "medium" });
  closed("missing-plan", undefined, { size: "medium", confirmations });
  writeFileSync(
    join(closed("invalid-plan"), "plan.md"),
    "## 执行顺序\n\n| 任务 | 前置任务 |\n| --- | --- |\n| T1 | T9 |\n",
  );
  closed("missing-dependency", undefined, { dependsOn: ["absent"] });
  closed("unfinished-dependency", undefined, { dependsOn: ["pending"] });
  closed("dependency-cycle-a", undefined, {
    dependsOn: ["dependency-cycle-b"],
  });
  closed("dependency-cycle-b", undefined, {
    dependsOn: ["dependency-cycle-a"],
  });
  closed("invalid-parent", undefined, { parent: "first" });
  closed("invalid-child", undefined, {
    size: "xlarge",
    confirmations,
    tasks: {},
    children: ["first"],
  });
  closed("unfinished-child", undefined, {
    size: "xlarge",
    confirmations,
    tasks: {},
    children: ["pending"],
  });
  closed("valid-parent", undefined, {
    size: "xlarge",
    confirmations,
    tasks: {},
    children: ["cancelled-child"],
  });
  closed("invalid-cancelled-parent", undefined, {
    size: "xlarge",
    confirmations,
    tasks: {},
    children: ["invalid-cancelled"],
  });
  writeFileSync(
    join(
      closed("valid-medium", undefined, { size: "medium", confirmations }),
      "plan.md",
    ),
    "# 计划\n\n## T1\n完成实现。\n",
  );
  f.commit();
  f.create("small", "sample", [
    "--follow-up-of",
    "second",
    "--group-title",
    "完善技术方案问询机制",
  ]);
  assert.equal(f.state().followUpOf, "second");
  assert.equal(f.state().followUpTitle, "完善技术方案问询机制");
  assert(!f.state().dependsOn);
  const before = readFileSync(f.path(), "utf8");
  f.run("follow-up", ["--target", "second", "--group-title", "其他名称"], 1);
  assert.equal(readFileSync(f.path(), "utf8"), before);
  f.run("follow-up", ["--target", "first", "--group-title", "两行\n标题"], 1);
  assert.equal(readFileSync(f.path(), "utf8"), before);
  f.run("follow-up", ["--target", "first", "--dry-run"]);
  assert.equal(readFileSync(f.path(), "utf8"), before);
  f.create("small", "pending", ["--parent", "unfinished-child"]);
  f.create("small", "cancelled-child", ["--parent", "valid-parent"]);
  f.run("cancel", ["--reason", "取消不影响已关闭父项"], 0, "cancelled-child");
  f.create("small", "invalid-cancelled", [
    "--parent",
    "invalid-cancelled-parent",
  ]);
  f.run("cancel", ["--reason", "取消"], 0, "invalid-cancelled");
  writeFileSync(
    f.path("invalid-cancelled"),
    JSON.stringify({
      ...f.state("invalid-cancelled"),
      closure: { verification: { ...confirmation, result: "passed" } },
    }),
  );
  f.commit();
  for (const target of [
    "sample",
    "missing",
    "loop-a",
    "pending",
    "../first",
    "missing-confirm",
    "missing-plan",
    "invalid-plan",
    "missing-dependency",
    "unfinished-dependency",
    "dependency-cycle-a",
    "invalid-parent",
    "invalid-child",
    "unfinished-child",
    "invalid-cancelled-parent",
  ]) {
    f.run("follow-up", ["--target", target], 1);
    assert.equal(readFileSync(f.path(), "utf8"), before);
  }
  closed("unpublished");
  f.commit(false);
  f.run("follow-up", ["--target", "unpublished"], 1);
  assert.equal(readFileSync(f.path(), "utf8"), before);
  f.run("follow-up", ["--target", "first"]);
  assert.equal(f.state().followUpOf, "first");
  assert(!f.state().followUpTitle);
  f.run("follow-up", ["--target", "first", "--group-title", "首次分组命名"]);
  assert.equal(f.state().followUpTitle, "首次分组命名");
  f.run("follow-up", ["--target", "valid-medium"]);
  assert.equal(f.state().followUpOf, "valid-medium");
  assert(!f.state().followUpTitle);
  f.run("follow-up", ["--target", "valid-parent"]);
  assert.equal(f.state().followUpOf, "valid-parent");
  f.run("follow-up", [
    "--target",
    "valid-parent",
    "--group-title",
    "父目标交付",
  ]);
  f.run("follow-up", ["--target", "none", "--group-title", "不应写入"], 1);
  assert.equal(f.state().followUpTitle, "父目标交付");
  f.run("follow-up", ["--target", "none"]);
  assert(!f.state().followUpOf);
  assert(!f.state().followUpTitle);
  f.run(
    "create",
    ["--title", "没有关联", "--size", "small", "--group-title", "无效组名"],
    1,
    "unlinked",
  );
  assert(!existsSync(f.path("unlinked")));
  f.run(
    "create",
    ["--title", "bad", "--size", "small", "--follow-up-of", "absent"],
    1,
    "bad",
  );
  assert(!existsSync(f.path("bad")));
});

test("small lifecycle on a custom collaboration branch preserves evidence, ordered timestamps and archive files", (t) => {
  const f = fixture(t, "team/integration");
  assert.equal(f.git("ls-remote", "origin", "refs/heads/main"), "");
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

test("clarification records persist questions, corrections and withdrawal across rework", (t) => {
  const f = fixture(t);
  f.create("medium");
  const ask = (round: string, extras: string[] = []) =>
    f.run("clarification-ask", [
      "--round",
      round,
      "--text",
      "导出范围？",
      "--recommendation",
      "仅当前筛选，沿用列表权限。",
      ...extras,
    ]);
  const before = readFileSync(f.path(), "utf8");
  ask("1", ["--dry-run"]);
  assert.equal(readFileSync(f.path(), "utf8"), before);
  ask("1");
  ask("1");
  assert.deepEqual(f.state().clarifications.Q1, {
    round: 1,
    question: "导出范围？",
    recommendation: "仅当前筛选，沿用列表权限。",
  });
  f.run("clarification-answer", [
    "--question",
    "Q1",
    "--answer",
    "按推荐",
    "--source",
    "本轮回答",
  ]);
  f.run("clarification-answer", [
    "--question",
    "Q1",
    "--answer",
    "只导出已选记录",
  ]);
  assert.equal(f.state().clarifications.Q1.answer, "只导出已选记录");
  assert(!f.state().clarifications.Q1.source);
  f.run("clarification-withdraw", [
    "--question",
    "Q1",
    "--reason",
    "导出功能移出本次范围",
  ]);
  assert.equal(f.state().clarifications.Q1.answer, "只导出已选记录");
  f.run("clarification-withdraw", [
    "--question",
    "Q2",
    "--reason",
    "已无关联需求",
  ]);
  f.confirm();
  const entries = f.state().clarifications;
  f.run("rework", [
    "--stage",
    "requirement",
    "--reason",
    "重新明确范围",
    "--approach",
    "保留访谈，重审需求",
  ]);
  assert.deepEqual(f.state().clarifications, entries);
  ask("2");
  assert.deepEqual(Object.keys(f.state().clarifications), ["Q1", "Q2", "Q3"]);
  assert.equal(f.state().clarifications.Q3.round, 2);
  assert.deepEqual(f.state().confirmations, {});
  // Historical facts, including explicitly authorized extra rounds, remain recordable.
  ask("3");
  assert.equal(f.state().clarifications.Q4.round, 3);
});

test("invalid clarification writes preserve state and cannot reuse withdrawn question ids", (t) => {
  const f = fixture(t);
  f.create();
  const args = [
    "--round",
    "1",
    "--text",
    "范围？",
    "--recommendation",
    "本次只做导出。",
  ];
  f.run("clarification-ask", args);
  f.run("clarification-withdraw", [
    "--question",
    "Q1",
    "--reason",
    "已移出范围",
  ]);
  const before = readFileSync(f.path(), "utf8");
  for (const round of ["0", "-1", "1.5", "1e2", "9007199254740992"])
    f.run("clarification-ask", ["--round", round, ...args.slice(2)], 1);
  for (const id of ["Q1", "Q0", "__proto__", "Q9007199254740992"])
    f.run("clarification-ask", [...args, "--question", id], 1);
  f.run(
    "clarification-ask",
    ["--round", "1", "--text", " ", "--recommendation", "建议"],
    1,
  );
  for (const id of ["Q1", "Q99", "__proto__"])
    f.run("clarification-answer", ["--question", id, "--answer", "确认"], 1);
  f.run("clarification-withdraw", ["--question", "Q1", "--reason", "重复"], 1);
  assert.equal(readFileSync(f.path(), "utf8"), before);
  f.run("clarification-ask", args);
  const pending = readFileSync(f.path(), "utf8");
  f.run("clarification-answer", ["--question", "Q2", "--answer", " "], 1);
  f.run(
    "clarification-answer",
    ["--question", "Q2", "--answer", "导出筛选结果", "--source", " "],
    1,
  );
  f.run("clarification-answer", [
    "--question",
    "Q2",
    "--answer",
    "导出筛选结果",
    "--dry-run",
  ]);
  f.run("clarification-withdraw", [
    "--question",
    "Q2",
    "--reason",
    "已移出范围",
    "--dry-run",
  ]);
  assert.equal(readFileSync(f.path(), "utf8"), pending);
  f.run("cancel", ["--reason", "不再实施"]);
  const cancelled = readFileSync(f.path(), "utf8");
  f.run("clarification-ask", args, 1);
  assert.equal(readFileSync(f.path(), "utf8"), cancelled);
});

test("all confirmation phases enforce 60 Unicode characters and single-line summaries on new writes", (t) => {
  const f = fixture(t);
  f.create("medium");
  const exactly60 = "😀".repeat(59) + "。";
  for (const phase of ["requirement", "technical", "plan", "merge"]) {
    const before = readFileSync(f.path(), "utf8");
    for (const summary of [
      exactly60 + "字",
      "字".repeat(61),
      "第一行\n第二行",
      "第一行\r第二行",
      "甲\u0085乙",
      "甲\u2028乙",
      "甲\u2029乙",
    ])
      f.run(
        "confirm",
        ["--phase", phase, "--summary", summary, "--source", "本轮明确确认"],
        1,
      );
    assert.equal(readFileSync(f.path(), "utf8"), before);
    f.run("confirm", [
      "--phase",
      phase,
      "--summary",
      exactly60,
      "--source",
      "本轮明确确认",
    ]);
    assert.equal(f.state().confirmations[phase].summary, exactly60);
  }
  const prior = f.state();
  prior.confirmations.requirement.summary = "历史摘要".repeat(30);
  writeFileSync(f.path(), JSON.stringify(prior));
  f.run("retitle", ["--title", "仍可操作旧记录"]);
  assert.equal(
    f.state().confirmations.requirement.summary,
    prior.confirmations.requirement.summary,
  );
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
    f.handoff();
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
    f.handoff();
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
  f.handoff();
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
  f.handoff();
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
  f.handoff();
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
  mkdirSync(join(f.common, "spec-trail-state.lock"));
  f.run("task-add", ["--title", "Contended"], 1);
  assert(existsSync(join(f.common, "spec-trail-state.lock")));
  rmSync(join(f.common, "spec-trail-state.lock"), { recursive: true });
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
  const hook = join(f.common, "hooks/pre-commit");
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
      schemaVersion: 2,
      collaborationBranch: "develop",
      protectedBranches: ["main"],
      prototype: {
        status: "enabled",
        packagePath: "packages/prototype",
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
  f.create();
  f.begin();
  f.done();
  f.verify();
  f.accept();
  f.archive();
  f.commit(false);
  const upstream = f.root;
  f.usePlanning();
  f.create("small", "next", ["--depends-on", "sample"]);
  f.run("task-add", ["--title", "Use prerequisite"], 0, "next");
  assert.match(f.run("execute", [], 1, "next"), /not closed/);
  assert.equal(f.state("next").stage, "requirement");
  f.at(upstream, "push", "origin", "HEAD");
  assert.match(f.handoff(1, "next"), /has not been integrated/);
  f.git("merge", "--no-edit", "change/sample");
  f.git("push", "origin", "develop");
  f.handoff(0, "next");
  f.run("execute", [], 0, "next");
  assert.equal(f.state("next").stage, "execution");
});

test("squashed delivery accepts explicit evidence while the archived dependency remains on its registered source", (t) => {
  const f = fixture(t);
  f.create();
  f.begin();
  f.done();
  f.verify();
  f.accept();
  f.archive();
  writeFileSync(join(f.root, "delivery.txt"), "upstream delivery\n");
  f.commit();
  const sourceCommit = f.git("rev-parse", "HEAD");
  f.usePlanning();
  f.git("merge", "--squash", "change/sample");
  // Import the delivered code, retaining the collaboration entry until the
  // source archive is integrated. Its pushed record remains the dependency.
  f.git("restore", "--source=HEAD", "--staged", "--worktree", "docs/project");
  f.git("commit", "-m", "Squash accepted upstream delivery");
  f.git("push", "origin", "develop");
  assert.equal(
    readFileSync(join(f.root, "delivery.txt"), "utf8"),
    "upstream delivery\n",
  );
  assert.throws(() =>
    f.git("merge-base", "--is-ancestor", sourceCommit, "HEAD"),
  );
  f.create("small", "next", ["--depends-on", "sample"]);
  f.run("task-add", ["--title", "Use upstream"], 0, "next");
  const note = `Verified delivery.txt matches archived sample after squash ${f.git("rev-parse", "HEAD")}`;
  f.handoff(0, "next", ["--availability-note", note]);
  assert.match(
    f.run("execute", [], 1, "next"),
    /Cannot establish sample by ancestry/,
  );
  const result = f.run("execute", ["--availability-note", note], 0, "next");
  assert.equal(result.state.stage, "execution");
  assert.equal(result.availability[0].sourceCommit, sourceCommit);
  assert.equal(result.availability[0].evidence, note);
});

test("state commands reject legacy workflow before writing planning or execution state", (t) => {
  const f = fixture(t);
  f.create();
  const before = readFileSync(f.path(), "utf8");
  writeFileSync(
    join(f.root, "docs/project/workflow.json"),
    JSON.stringify({
      schemaVersion: 1,
      protectedBranches: ["main"],
    }),
  );
  for (const command of ["show", "execute", "retitle"])
    assert.match(
      f.run(command, command === "retitle" ? ["--title", "Rejected"] : [], 1),
      /Invalid workflow.json.*(?:version 2|schemaVersion)/,
    );
  assert.equal(readFileSync(f.path(), "utf8"), before);
  assert.match(
    f.run("create", ["--title", "Rejected", "--size", "small"], 1, "other"),
    /Invalid workflow.json/,
  );
  assert(!existsSync(f.path("other")));
});
