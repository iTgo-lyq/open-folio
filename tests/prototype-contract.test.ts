import test from "node:test";
import assert from "node:assert/strict";
import { readFile, symlink } from "node:fs/promises";
import { execFileSync, spawnSync } from "node:child_process";
import { resolve, join } from "node:path";
import vm from "node:vm";
import * as contract from "../.agents/skills/spec-trail/prototype/scripts/contract.mjs";
import { changeSchema, prototypeSchema } from "../src/server/schema.ts";
import { fixture } from "./fixture.ts";
import { DEFAULT_LIMITS, primaryRecord } from "../src/lib/model.ts";
const decision = { at: "2026-10-03T01:20:00+08:00", summary: "用户同意" };
const enabled = {
  status: "enabled",
  packagePath: "packages/prototype",
  decision,
};
const entry = {
  id: "list",
  title: "列表",
  path: "packages/prototype/preview/list",
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
  branch: "main",
  confirmations: {},
  tasks: { T1: { title: "实现", status: "doing" } },
  closure: {},
  ...(previews === undefined ? {} : { previews }),
});

test("prototype contract and hook agree for page/component variants and reject malformed extensions", async () => {
  const context = vm.createContext({ shared: contract });
  const hook = await readFile(
    ".agents/skills/spec-trail/setup/scripts/pre-commit.js",
    "utf8",
  );
  vm.runInContext(
    hook.slice(0, hook.indexOf("async function main()")) +
      '\nprototypeContract = shared; globalThis.check = v => { const e=[]; change(v,"",e); return e; };',
    context,
  );
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
        path: "packages/prototype/preview/card",
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
      context.check(value).length === 0,
      JSON.stringify(previews),
    );
  }
  assert(prototypeSchema.safeParse(enabled).success);
  assert(prototypeSchema.safeParse({ status: "disabled", decision }).success);
  for (const value of [
    { ...enabled, packagePath: "docs/prototype" },
    { ...enabled, packagePath: "/outside" },
    { ...enabled, status: "disabled" },
    { ...enabled, decision: { ...decision, at: "2026-02-30T00:00:00Z" } },
  ])
    assert(!prototypeSchema.safeParse(value).success);
});

test("hook checks staged entries, rejects deletion and symlinks, and permits ordinary edits after disabling", async (t) => {
  const f = await fixture();
  t.after(f.cleanup);
  const run = () =>
    spawnSync(
      process.execPath,
      [resolve(".agents/skills/spec-trail/setup/scripts/pre-commit.js")],
      { cwd: f.author, encoding: "utf8" },
    );
  const stage = () => execFileSync("git", ["add", "."], { cwd: f.author });
  const path = "docs/project/changes/prototype/change.json";
  await f.put(
    "docs/project/workflow.json",
    JSON.stringify({
      schemaVersion: 1,
      protectedBranches: ["main"],
      prototype: enabled,
    }),
  );
  await f.put(path, JSON.stringify(state([entry])));
  stage();
  await f.put(`${entry.path}/index.html`, "<!doctype html><h1>not staged</h1>");
  assert.equal(run().status, 1);
  stage();
  assert.equal(run().status, 0);
  f.commit();
  f.git(["rm", `${entry.path}/index.html`]);
  assert.equal(run().status, 1);
  f.git([
    "restore",
    "--source=HEAD",
    "--staged",
    "--worktree",
    `${entry.path}/index.html`,
  ]);
  const { rm } = await import("node:fs/promises");
  await rm(join(f.author, entry.path, "index.html"));
  await symlink("/etc/passwd", join(f.author, entry.path, "index.html"));
  stage();
  assert.equal(run().status, 1);
  f.git([
    "restore",
    "--source=HEAD",
    "--staged",
    "--worktree",
    `${entry.path}/index.html`,
  ]);
  await f.put(
    "docs/project/workflow.json",
    JSON.stringify({
      schemaVersion: 1,
      protectedBranches: ["main"],
      prototype: { status: "disabled", decision },
    }),
  );
  await f.put(
    path,
    JSON.stringify({ ...state([entry]), title: "只修改流程正文" }),
  );
  stage();
  assert.equal(run().status, 0);
  f.commit();
  await f.put(path, JSON.stringify(state([{ ...entry, title: "新关联" }])));
  stage();
  assert.equal(run().status, 1);
  await f.put(path, JSON.stringify(state([])));
  stage();
  assert.equal(run().status, 0);
});

test("invalid previews retain the Change core and old workflow stays readable", async (t) => {
  const f = await fixture();
  t.after(f.cleanup);
  await f.put(
    "docs/project/changes/prototype/change.json",
    JSON.stringify(state([{ ...entry, devices: ["watch"] }])),
  );
  f.commit();
  const snapshot = await f.store.refresh(f.project, DEFAULT_LIMITS);
  const record = primaryRecord(
    snapshot.changes.find((c) => c.id === "prototype")!,
  )!;
  assert(record.state);
  assert.equal(record.state.previews, undefined);
  assert(record.diagnostics.some((d) => d.code === "PREVIEWS_INVALID"));
  assert.equal(snapshot.specBranch, "main");
});
