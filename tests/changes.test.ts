import test from "node:test";
import assert from "node:assert/strict";
import { rm, mkdir, rename } from "node:fs/promises";
import { join } from "node:path";
import { validateChange } from "../.agents/skills/spec-trail/scripts/state-schema.mjs";
import { changeSchema } from "../src/server/schema.ts";
import { parsePlan, cyclicNodes } from "../src/server/plan.ts";
import {
  DEFAULT_LIMITS,
  primaryRecord,
  type ChangeState,
} from "../src/lib/model.ts";
import { fixture } from "./fixture.ts";
const at = "2026-10-02T08:00:00+08:00";
export function state(
  id: string,
  patch: Partial<ChangeState> = {},
): ChangeState {
  return {
    schemaVersion: 1,
    id,
    title: `${id} 功能`,
    branch: `change/${id}`,
    size: "small",
    status: "active",
    stage: "execution",
    confirmations: {},
    tasks: { T1: { title: "实现", status: "todo" } },
    closure: {},
    ...patch,
  };
}
const confirmation = { at, summary: "已确认" };
const confirmations = {
  requirement: confirmation,
  technical: confirmation,
  plan: confirmation,
};
const completed = (id: string): ChangeState =>
  state(id, {
    status: "completed",
    stage: "close",
    tasks: { T1: { title: "实现", status: "done" } },
    closure: {
      verification: { at, summary: "测试通过", result: "passed" },
      acceptance: { at, summary: "人工验收", result: "accepted" },
      specs: { at, summary: "已同步", result: "synced" },
      archive: {
        at,
        summary: "归档",
        result: "done",
        path: `docs/project/archive/2026-10-02-${id}`,
      },
    },
  });

test("strict schema agrees with current skill hook on shared structural examples", async () => {
  const samples: unknown[] = [
    state("normal"),
    state("cancelled", {
      status: "cancelled",
      cancellation: { at, reason: "取消" },
    }),
    completed("closed"),
    state("large", { size: "large", confirmations }),
    state("xlarge", { size: "xlarge", tasks: {}, children: ["one"] }),
    state("blocked", {
      tasks: { T1: { title: "阻塞", status: "blocked", reason: "等待上游" } },
    }),
  ];
  const mutations = [
    { schemaVersion: 2 },
    { size: "tiny" },
    { status: "paused" },
    { title: "  " },
    { branch: "a b" },
    { tasks: { T0: { title: "错误", status: "todo" } } },
    { tasks: { T1: { title: "阻塞", status: "blocked" } } },
    { status: "cancelled" },
    { dependsOn: ["one", "one"] },
    { extra: true },
    { closure: { acceptance: { at, summary: "拒绝", result: "rejected" } } },
  ];
  samples.push(...mutations.map((p) => ({ ...state("invalid"), ...p })));
  for (const time of [
    at,
    "2024-02-29T00:00:00Z",
    "2023-02-29T00:00:00Z",
    "2026-10-01T23:59:60Z",
    "2026-10-01T12:59:60Z",
    "2026-01-01T00:00:00",
    "2026-01-01T00:00:00+24:00",
  ])
    samples.push(
      state("time", {
        confirmations: { requirement: { at: time, summary: "时间" } },
      }),
    );
  for (const sample of samples)
    assert.equal(
      changeSchema.safeParse(sample).success,
      validateChange(sample).length === 0,
      JSON.stringify(sample),
    );
});

test("Plan AST only uses complete unambiguous execution tables and detects cycles", () => {
  const s = state("plan", {
    size: "large",
    tasks: {
      T1: { title: "一", status: "done" },
      T2: { title: "二", status: "doing" },
    },
  });
  const good =
    "## 执行顺序\n\n| 任务 | 前置任务 |\n| --- | --- |\n| **T1** | 无 |\n| [T2](#two) | `T1` |\n";
  assert.deepEqual(parsePlan(s, good).edges, { T1: [], T2: ["T1"] });
  assert.equal(parsePlan(s, good).status, "valid");
  for (const bad of [
    good + good,
    "```md\n" + good + "```",
    good.replace("| **T1** | 无 |", "| **T1** | T2 |"),
    good.replace("| [T2](#two) | `T1` |", ""),
    good.replace("`T1`", "T8"),
    good.replace("| 无 |", "| |"),
    good.replace("## 执行顺序", "## 顺序"),
  ])
    assert.equal(parsePlan(s, bad).status, "invalid");
  assert.equal(parsePlan(s).status, "missing");
  assert.equal(
    parsePlan({ ...s, size: "xlarge" }, good).status,
    "not-applicable",
  );
});

test("invalid authoritative record survives valid stale copies; conflict and missing owner are explicit", async (t) => {
  const f = await fixture();
  t.after(f.cleanup);
  const path = "docs/project/changes/alpha/change.json";
  await f.put(path, JSON.stringify(state("alpha")));
  f.commit();
  f.git(["checkout", "-b", "change/alpha"]);
  await f.put(path, JSON.stringify({ ...state("alpha"), title: " " }));
  f.commit();
  let snap = await f.store.refresh(f.project, DEFAULT_LIMITS),
    g = snap.changes.find((g) => g.id === "alpha")!;
  assert.equal(g.candidates.length, 2);
  assert.equal(primaryRecord(g)?.branch, "change/alpha");
  assert.equal(primaryRecord(g)?.state, null);
  f.git(["checkout", "-b", "change/second"]);
  await f.put(
    path,
    JSON.stringify(state("alpha", { branch: "change/second" })),
  );
  f.commit();
  snap = await f.store.refresh(f.project, DEFAULT_LIMITS);
  g = snap.changes.find((g) => g.id === "alpha")!;
  assert.equal(g.primary, null);
  assert.equal(g.diagnostics[0].code, "OWNER_CONFLICT");
  f.git(["push", "origin", "--delete", "change/second", "change/alpha"]);
  snap = await f.store.refresh(f.project, DEFAULT_LIMITS);
  g = snap.changes.find((g) => g.id === "alpha")!;
  assert.equal(g.primary, null);
  assert.equal(g.diagnostics[0].code, "OWNER_MISSING");
});

test("completion, dependency ancestry, live leftovers, cancellation and parent cycles stay distinct", async (t) => {
  const f = await fixture();
  t.after(f.cleanup);
  f.git(["checkout", "-b", "change/upstream"]);
  await f.put(
    "docs/project/archive/2026-10-02-upstream/change.json",
    JSON.stringify(completed("upstream")),
  );
  f.commit();
  f.git(["checkout", "-b", "change/downstream"]);
  await f.put(
    "docs/project/changes/downstream/change.json",
    JSON.stringify(state("downstream", { dependsOn: ["upstream"] })),
  );
  f.commit();
  f.git(["checkout", "main"]);
  f.git(["checkout", "-b", "change/squashed"]);
  f.git(["merge", "--squash", "change/upstream"]);
  await f.put(
    "docs/project/changes/squashed/change.json",
    JSON.stringify(state("squashed", { dependsOn: ["upstream"] })),
  );
  f.commit();
  let snap = await f.store.refresh(f.project, DEFAULT_LIMITS);
  const rel = (id: string) =>
    snap.changes.find((g) => g.id === id)!.relations[0];
  assert.equal(rel("downstream").process, "satisfied");
  assert.equal(rel("downstream").ancestry, "found");
  assert.equal(rel("squashed").process, "satisfied");
  assert.equal(rel("squashed").ancestry, "unknown");
  f.git(["checkout", "change/upstream"]);
  await f.put("docs/project/changes/upstream/requirement.md", "# 残留");
  f.commit();
  snap = await f.store.refresh(f.project, DEFAULT_LIMITS);
  assert.equal(
    primaryRecord(snap.changes.find((g) => g.id === "upstream")!)
      ?.validCompleted,
    false,
  );
  assert.equal(rel("downstream").process, "unknown");
  f.git(["checkout", "main"]);
  f.git(["checkout", "-b", "change/parent"]);
  await f.put(
    "docs/project/changes/parent/change.json",
    JSON.stringify(
      state("parent", {
        size: "xlarge",
        children: ["child"],
        tasks: {},
        confirmations,
      }),
    ),
  );
  f.commit();
  f.git(["checkout", "-b", "change/child"]);
  await f.put(
    "docs/project/changes/child/change.json",
    JSON.stringify(state("child", { parent: "parent", dependsOn: ["parent"] })),
  );
  f.commit();
  snap = await f.store.refresh(f.project, DEFAULT_LIMITS);
  assert(
    snap.changes
      .find((g) => g.id === "parent")!
      .diagnostics.some((d) => d.code === "RELATION_CYCLE"),
  );
  assert(
    snap.changes
      .find((g) => g.id === "child")!
      .relations.some((r) => r.diagnostics.some((d) => d.includes("父项"))),
  );
});

test("size routes preserve confirmations, closure order and explicit Spec references", async (t) => {
  const f = await fixture();
  t.after(f.cleanup);
  f.git(["checkout", "-b", "change/routes"]);
  const putState = async (id: string, patch: Partial<ChangeState>) =>
    f.put(
      `docs/project/changes/${id}/change.json`,
      JSON.stringify(state(id, { branch: "change/routes", ...patch })),
    );
  await putState("small", { confirmations });
  await putState("medium", { size: "medium", stage: "plan", confirmations });
  await putState("large", { size: "large" });
  await putState("cancelled", {
    status: "cancelled",
    cancellation: { at, reason: "需求取消" },
  });
  await putState("early-close", {
    stage: "close",
    closure: { acceptance: { result: "accepted", at, summary: "次序错误" } },
  });
  await f.put(
    "docs/project/changes/small/requirement.md",
    "# 小修改\n[平台](../../specs/platform/spec.md)\n",
  );
  f.commit();
  const snap = await f.store.refresh(f.project, DEFAULT_LIMITS),
    record = (id: string) =>
      primaryRecord(snap.changes.find((g) => g.id === id)!)!;
  assert.equal(record("small").diagnostics.length, 0);
  assert.equal(Object.keys(record("small").state!.confirmations).length, 3);
  assert.deepEqual(record("small").relatedSpecs, ["platform"]);
  assert.equal(record("small").specReferences[0].line, 2);
  assert(record("medium").diagnostics.some((d) => d.code === "STAGE_ROUTE"));
  assert.equal(
    record("large").diagnostics.filter((d) => d.code === "CONFIRMATION_MISSING")
      .length,
    3,
  );
  assert.equal(record("cancelled").diagnostics.length, 0);
  assert(
    record("early-close").diagnostics.some((d) => d.code === "CLOSURE_ORDER"),
  );
});

test("cycle detection includes every member of overlapping cycles", () => {
  assert.deepEqual(
    [...cyclicNodes({ A: ["B", "C"], B: ["A"], C: ["B"], D: ["A"] })].sort(),
    ["A", "B", "C"],
  );
});

test("invalid archived relationships propagate through consumers and closing parents regardless of order", async (t) => {
  const f = await fixture();
  t.after(f.cleanup);
  f.git(["checkout", "-b", "change/relations"]);
  const records = [
    state("constructor-consumer", { dependsOn: ["constructor"] }),
    {
      ...completed("a-parent"),
      size: "xlarge",
      children: ["b-consumer"],
      tasks: {},
      confirmations,
    },
    { ...completed("b-consumer"), parent: "a-parent", dependsOn: ["c-broken"] },
    {
      ...completed("c-broken"),
      parent: "missing-parent",
      dependsOn: ["missing-upstream"],
    },
    state("downstream", { dependsOn: ["a-parent", "b-consumer", "c-broken"] }),
  ];
  for (const s of records)
    await f.put(
      `${s.status === "completed" ? s.closure.archive!.path : `docs/project/changes/${s.id}`}/change.json`,
      JSON.stringify({ ...s, branch: "change/relations" }),
    );
  f.commit();
  const snap = await f.store.refresh(f.project, DEFAULT_LIMITS);
  for (const id of ["a-parent", "b-consumer", "c-broken"]) {
    const g = snap.changes.find((g) => g.id === id)!;
    assert.equal(primaryRecord(g)?.validCompleted, false, id);
    assert(g.diagnostics.length || primaryRecord(g)!.diagnostics.length, id);
  }
  for (const r of snap.changes.find((g) => g.id === "downstream")!.relations) {
    assert.notEqual(r.process, "satisfied");
    assert.equal(r.ancestry, "unknown");
  }
  assert(
    primaryRecord(
      snap.changes.find((g) => g.id === "a-parent")!,
    )!.diagnostics.some((d) => d.code === "CHILDREN_UNFINISHED"),
  );
});

test("missing prototype-named targets remain local diagnostics", () => {
  assert.deepEqual([...cyclicNodes({ alpha: ["constructor"] })], []);
});
