import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, symlink, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { resolve, join } from "node:path";
import {
  validateChange,
  validateWorkflow,
} from "../.agents/skills/spec-trail/scripts/state-schema.mjs";
import {
  changeSchema,
  prototypeSchema,
  workflowSchema,
} from "../src/server/schema.ts";
import { fixture } from "./fixture.ts";
import { DEFAULT_LIMITS, primaryRecord } from "../src/lib/model.ts";
const enabled = {
  status: "enabled",
  packagePath: "packages/prototype",
};

test("workflow readers agree on optional hosting choices and service presence", () => {
  for (const [extra, valid] of [
    [{}, true],
    [
      {
        openfolioUrl: null,
        prototype: { ...enabled, hosting: { provider: "git" } },
      },
      true,
    ],
    [
      {
        openfolioUrl: "http://folio.test",
        prototype: {
          ...enabled,
          hosting: {
            provider: "openfolio",
            uploadUrl: "http://folio.test/upload/key",
          },
        },
      },
      true,
    ],
    [{ prototype: { ...enabled, hosting: { provider: "custom" } } }, true],
    [
      {
        openfolioUrl: null,
        prototype: {
          ...enabled,
          hosting: {
            provider: "openfolio",
            uploadUrl: "http://folio.test/upload/key",
          },
        },
      },
      false,
    ],
    [{ openfolioUrl: "javascript:alert(1)" }, false],
    [
      {
        prototype: {
          ...enabled,
          hosting: {
            provider: "git",
            uploadUrl: "http://folio.test/upload/key",
          },
        },
      },
      false,
    ],
  ] as const) {
    const workflow = {
      schemaVersion: 2,
      collaborationBranch: "develop",
      protectedBranches: ["main"],
      ...extra,
    };
    assert.equal(validateWorkflow(workflow).length === 0, valid);
    assert.equal(workflowSchema.safeParse(workflow).success, valid);
  }
});
const entry = {
  id: "list",
  title: "列表",
  artifact: {
    type: "git",
    path: "packages/prototype/preview/list",
    sourceCommit: "a".repeat(40),
  },
  kind: "page",
  devices: ["mobile", "pc-web"],
};
const state = (previews?: unknown) => ({
  schemaVersion: 1,
  id: "prototype",
  title: "原型",
  size: "small",
  status: "active",
  stage: "execution",
  branch: "change/prototype",
  confirmations: {},
  tasks: { T1: { title: "实现", status: "doing" } },
  closure: {},
  ...(previews === undefined ? {} : { previews }),
});

test("prototype contract and hook agree for page/component variants and reject malformed extensions", async () => {
  const cases = [
    undefined,
    [],
    [entry],
    [{ ...entry, kind: "component" }],
    [
      {
        id: "card",
        title: "卡片",
        kind: "component",
        artifact: {
          type: "git",
          path: "packages/prototype/preview/card",
          sourceCommit: "a".repeat(40),
        },
        viewport: { width: 640, height: 320 },
      },
    ],
    null,
    [entry, entry],
    [{ ...entry, devices: [] }],
    [{ ...entry, devices: ["mobile", "mobile"] }],
    [{ ...entry, viewport: { width: 100, height: 100 } }],
    [{ ...entry, path: "packages/prototype/preview/../secret" }],
    [{ ...entry, path: "packages/prototype/preview/%2e%2e" }],
    [{ ...entry, extra: true }],
    [
      {
        ...entry,
        kind: "component",
        devices: undefined,
        viewport: { width: 4097, height: 100 },
      },
    ],
  ];
  for (const previews of cases) {
    const value = state(previews);
    assert.equal(
      changeSchema.safeParse(value).success,
      validateChange(value).length === 0,
      JSON.stringify(previews),
    );
  }
  assert(
    !changeSchema.safeParse(
      state([
        {
          ...entry,
          artifact: undefined,
          path: "packages/prototype/preview/list",
        },
      ]),
    ).success,
  );
  assert(prototypeSchema.safeParse(enabled).success);
  assert(prototypeSchema.safeParse({ ...enabled, status: "pending" }).success);
  assert(prototypeSchema.safeParse({ status: "disabled" }).success);
  for (const value of [
    { ...enabled, packagePath: "docs/prototype" },
    { ...enabled, packagePath: "/outside" },
    { ...enabled, status: "disabled" },
    { ...enabled, extra: true },
  ])
    assert(!prototypeSchema.safeParse(value).success);
});

test("hook checks staged entries, rejects deletion and symlinks, and permits ordinary edits after disabling", async (t) => {
  const f = await fixture();
  t.after(f.cleanup);
  const work = join(f.root, "prototype-work");
  const put = async (path: string, body: string) => {
    const target = join(work, path);
    await mkdir(join(target, ".."), { recursive: true });
    await writeFile(target, body);
  };
  const git = (args: string[]) => f.git(args, work);
  const commit = () => {
    git(["add", "."]);
    git(["commit", "-m", "Prototype checkpoint"]);
    git(["push", "origin", "HEAD"]);
  };
  const run = () =>
    spawnSync(
      process.execPath,
      [resolve(".agents/skills/spec-trail/setup/scripts/pre-commit.js")],
      { cwd: work, encoding: "utf8" },
    );
  const stage = () => git(["add", "."]);
  const path = "docs/project/changes/prototype/change.json";
  await f.put(
    "docs/project/workflow.json",
    JSON.stringify({
      schemaVersion: 2,
      collaborationBranch: "develop",
      protectedBranches: ["main"],
      prototype: enabled,
    }),
  );
  await f.put(
    path,
    JSON.stringify({
      ...state(),
      branch: "develop",
      stage: "requirement",
      tasks: { T1: { title: "实现", status: "todo" } },
    }),
  );
  await f.put(
    "docs/project/changes/prototype/requirement.md",
    "# Prototype contract\n",
  );
  f.commit();
  const handoff = spawnSync(
    process.execPath,
    [
      resolve(".agents/skills/spec-trail/scripts/workspace.mjs"),
      "handoff",
      "--repo",
      f.author,
      "--change",
      "prototype",
      "--path",
      work,
    ],
    { encoding: "utf8" },
  );
  assert.equal(handoff.status, 0, handoff.stderr);
  for (const args of [["execute"], ["task-start", "--task", "T1"]]) {
    const step = spawnSync(
      process.execPath,
      [
        resolve(".agents/skills/spec-trail/scripts/change.mjs"),
        ...args,
        "--repo",
        work,
        "--change",
        "prototype",
      ],
      { encoding: "utf8" },
    );
    assert.equal(step.status, 0, step.stderr);
  }
  entry.artifact.sourceCommit = git(["rev-parse", "HEAD"]);
  const retained = [entry, { ...entry, id: "detail", title: "详情" }];
  await put(path, JSON.stringify(state(retained)));
  stage();
  await put(
    `${entry.artifact.path}/index.html`,
    "<!doctype html><h1>not staged</h1>",
  );
  assert.equal(run().status, 1);
  stage();
  assert.equal(run().status, 0);
  commit();
  git(["rm", `${entry.artifact.path}/index.html`]);
  assert.equal(run().status, 1);
  git([
    "restore",
    "--source=HEAD",
    "--staged",
    "--worktree",
    `${entry.artifact.path}/index.html`,
  ]);
  const { rm } = await import("node:fs/promises");
  await rm(join(work, entry.artifact.path, "index.html"));
  await symlink("/etc/passwd", join(work, entry.artifact.path, "index.html"));
  stage();
  assert.equal(run().status, 1);
  git([
    "restore",
    "--source=HEAD",
    "--staged",
    "--worktree",
    `${entry.artifact.path}/index.html`,
  ]);
  await put(
    "docs/project/workflow.json",
    JSON.stringify({
      schemaVersion: 2,
      collaborationBranch: "develop",
      protectedBranches: ["main"],
      prototype: { status: "disabled" },
    }),
  );
  await put(
    path,
    JSON.stringify({ ...state(retained), title: "只修改流程正文" }),
  );
  stage();
  assert.equal(run().status, 0);
  commit();
  await put(path, JSON.stringify(state([entry])));
  stage();
  assert.equal(run().status, 0); // Removing only one old association remains allowed.
  await put(path, JSON.stringify(state([{ ...entry, title: "新关联" }])));
  stage();
  assert.equal(run().status, 1);
  await put(path, JSON.stringify(state([])));
  stage();
  assert.equal(run().status, 0);
});

test("invalid previews retain the Change core on its registered source", async (t) => {
  const f = await fixture();
  t.after(f.cleanup);
  await f.put(
    "docs/project/changes/prototype/change.json",
    JSON.stringify({
      ...state([{ ...entry, devices: ["watch"] }]),
      branch: "change/prototype",
    }),
  );
  f.commit();
  f.git(["checkout", "-b", "change/prototype"]);
  f.git(["push", "origin", "HEAD"]);
  const snapshot = await f.store.refresh(f.project, DEFAULT_LIMITS);
  const record = primaryRecord(
    snapshot.changes.find((c) => c.id === "prototype")!,
  )!;
  assert(record.state);
  assert.equal(record.state.previews, undefined);
  assert(record.diagnostics.some((d) => d.code === "PREVIEWS_INVALID"));
  assert.equal(snapshot.specBranch, "develop");
});
