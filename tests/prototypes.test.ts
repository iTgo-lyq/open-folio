import test from "node:test";
import assert from "node:assert/strict";
import { fixture } from "./fixture.ts";
import { DEFAULT_LIMITS } from "../src/lib/model.ts";
import { matchingPrototypeReferences } from "../src/lib/prototypes.ts";
const decision = { at: "2026-10-03T02:30:00+08:00", summary: "同意" };
const entry = {
  id: "screen",
  title: "共享页面",
  kind: "page",
  path: "packages/prototype/preview/screen",
  devices: ["pc-web"],
};
const state = (id: string, previews: unknown) => ({
  schemaVersion: 1,
  id,
  title: `${id} 设计`,
  size: "small",
  status: "active",
  stage: "execution",
  branch: `change/${id}`,
  confirmations: {},
  tasks: { T1: { title: "交付", status: "doing" } },
  closure: {},
  previews,
});

test("project inventory deduplicates shared entries, uses primary records and keeps valid entries beside invalid associations", async (t) => {
  const f = await fixture();
  t.after(f.cleanup);
  await f.put(
    "docs/project/workflow.json",
    JSON.stringify({
      schemaVersion: 1,
      protectedBranches: ["main"],
      prototype: {
        status: "enabled",
        packagePath: "packages/prototype",
        decision,
      },
    }),
  );
  f.commit();
  f.git(["checkout", "-b", "change/alpha"]);
  await f.put(
    "docs/project/changes/alpha/change.json",
    JSON.stringify(
      state("alpha", [
        entry,
        {
          ...entry,
          id: "chip",
          title: "按钮组件",
          kind: "component",
          path: "packages/prototype/preview/chip",
          devices: undefined,
          viewport: { width: 400, height: 100 },
        },
      ]),
    ),
  );
  f.commit();
  f.git(["checkout", "-b", "change/beta"]);
  await f.put(
    "docs/project/changes/beta/change.json",
    JSON.stringify(
      state("beta", [
        { ...entry, id: "responsive", title: "移动适配", devices: ["mobile"] },
        { id: "invalid" },
      ]),
    ),
  );
  f.commit();
  const snapshot = await f.store.refresh(f.project, DEFAULT_LIMITS);
  const catalog = await f.store.prototypes(f.project, snapshot.id);
  assert.equal(catalog.items.length, 2);
  assert.equal(catalog.issues.length, 1);
  assert.equal(catalog.issues[0].changeId, "beta");
  const screen = catalog.items.find((i) => i.kind === "page")!;
  assert.equal(screen.references.length, 2);
  assert.deepEqual(
    screen.references.map((r) => r.changeId),
    ["alpha", "beta"],
  );
  assert.equal(
    matchingPrototypeReferences(screen, "移动适配", "mobile")[0].changeId,
    "beta",
  );
  assert.equal(
    matchingPrototypeReferences(screen, "alpha", "mobile").length,
    0,
  );
  assert.equal(
    matchingPrototypeReferences(screen, "packages/prototype", "pc-web")[0]
      .changeId,
    "alpha",
  );
  assert.equal(
    matchingPrototypeReferences(
      catalog.items.find((i) => i.kind === "component")!,
      "",
      "custom",
    ).length,
    1,
  );
  // Inventory is metadata: no HTML was exported and no availability is claimed.
  assert(screen.references.every((r) => !("available" in r)));
  // A conflicting stale copy on beta cannot inflate alpha's inventory.
  await f.put(
    "docs/project/changes/alpha/change.json",
    JSON.stringify(
      state("alpha", [{ ...entry, path: "packages/prototype/preview/stale" }]),
    ),
  );
  f.commit();
  await f.store.refresh(f.project, DEFAULT_LIMITS);
  assert.equal((await f.store.prototypes(f.project)).items.length, 2);
  f.git(["checkout", "main"]);
  await f.put(
    "docs/project/workflow.json",
    JSON.stringify({
      schemaVersion: 1,
      protectedBranches: ["main"],
      prototype: { status: "disabled", decision },
    }),
  );
  f.commit();
  await f.store.refresh(f.project, DEFAULT_LIMITS);
  const disabled = await f.store.prototypes(f.project, snapshot.id);
  assert.equal(disabled.policy.status, "disabled");
  assert.equal(disabled.items.length, 2);
});

test("inventory reports unresolved prototype sources without inventing duplicates and validates snapshot scope", async (t) => {
  const f = await fixture();
  t.after(f.cleanup);
  await f.put(
    "docs/project/changes/alpha/change.json",
    JSON.stringify(state("alpha", [entry])),
  );
  f.commit();
  await f.store.refresh(f.project, DEFAULT_LIMITS);
  const catalog = await f.store.prototypes(f.project);
  assert.equal(catalog.items.length, 0);
  assert.equal(catalog.issues.length, 1);
  assert.match(catalog.issues[0].message, /主来源/);
  await assert.rejects(f.store.prototypes(f.project, "../../private"), {
    code: "INVALID_PARAMETER",
  });
  await assert.rejects(f.store.prototypes({ ...f.project, id: "other" }), {
    code: "NO_SNAPSHOT",
  });
});

test("invalid core records with unresolved ownership do not hide prototype associations", async (t) => {
  const f = await fixture();
  t.after(f.cleanup);
  await f.put(
    "docs/project/workflow.json",
    JSON.stringify({
      schemaVersion: 1,
      protectedBranches: ["main"],
      prototype: {
        status: "enabled",
        packagePath: "packages/prototype",
        decision,
      },
    }),
  );
  for (const [id, previews] of [
    ["associated", [entry]],
    ["malformed", null],
    ["empty", []],
    ["unrelated", undefined],
  ] as const)
    await f.put(
      `docs/project/changes/${id}/change.json`,
      JSON.stringify({ ...state(id, previews), schemaVersion: 2 }),
    );
  await f.put("docs/project/changes/unreadable/change.json", "{invalid");
  f.commit();
  await f.store.refresh(f.project, DEFAULT_LIMITS);
  const catalog = await f.store.prototypes(f.project);
  assert.equal(catalog.policy.status, "enabled");
  assert.equal(catalog.items.length, 0);
  assert.deepEqual(catalog.issues.map((issue) => issue.changeId).sort(), [
    "associated",
    "malformed",
    "unreadable",
  ]);
  assert.match(
    catalog.issues.find((issue) => issue.changeId === "associated")!.message,
    /主来源/,
  );
  assert.match(
    catalog.issues.find((issue) => issue.changeId === "unreadable")!.message,
    /无法确认/,
  );
});
