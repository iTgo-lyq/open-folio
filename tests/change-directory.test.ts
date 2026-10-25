import test from "node:test";
import assert from "node:assert/strict";
import {
  readDirectoryQuery,
  directoryQueryParams,
  filterDirectoryChanges,
  sortDirectoryChanges,
  groupDirectoryChanges,
  matchesDirectoryScope,
  processingStatus,
} from "../src/lib/change-directory.ts";
import type {
  ChangeGroup,
  ChangeCandidate,
  ChangeState,
  Delivery,
} from "../src/lib/model.ts";
function change(
  id: string,
  patch: Partial<ChangeState> = {},
  createdAt = "2026-10-20T00:00:00.000Z",
  creator = "lin",
): ChangeGroup {
  const state = {
    status: "active",
    stage: "execution",
    tasks: {},
    ...patch,
  } as ChangeState;
  const record = {
    key: id,
    state,
    validCompleted: state.status === "completed",
    diagnostics: [],
    taskGraph: { diagnostics: [] },
  } as unknown as ChangeCandidate;
  return {
    id,
    title: id,
    primary: id,
    candidates: [record],
    diagnostics: [],
    relations: [],
    createdAt,
    creator: { name: creator },
  };
}
test("directory filters combine OR within each facet and AND across facets without splitting custom labels", () => {
  const a = change("a", { types: ['数据, "迁移"'], urgency: "high" });
  const b = change("b", { types: ["体验"], urgency: "normal" });
  const c = change("c", { types: ["修复"], urgency: "high" }, undefined, "mei");
  const query = readDirectoryQuery({
    types: JSON.stringify(['数据, "迁移"', "体验"]),
    urgency: JSON.stringify(["high", "normal"]),
    creator: '["lin"]',
  });
  assert.deepEqual(
    filterDirectoryChanges([a, b, c], query).map((g) => g.id),
    ["a", "b"],
  );
  query.urgencies = ["high"];
  assert.deepEqual(
    filterDirectoryChanges([a, b, c], query).map((g) => g.id),
    ["a"],
  );
  const none = change("none");
  const noTypes = readDirectoryQuery({ types: '["修复"]', noTypes: "1" });
  assert.deepEqual(
    filterDirectoryChanges([a, b, c, none], noTypes).map((g) => g.id),
    ["c", "none"],
  );
  assert.deepEqual(
    directoryQueryParams(readDirectoryQuery({ creator: '["missing"]' }))
      .creator,
    '["missing"]',
  );
});
test("directory query keeps single urgency links, normalizes invalid fields and de-duplicates multiple selections", () => {
  assert.equal(
    directoryQueryParams(readDirectoryQuery({ urgency: "normal" })).urgency,
    "normal",
  );
  const query = readDirectoryQuery({
    types: '["体验","体验"]',
    urgency: '["high","urgent","high"]',
    creator: '["林","林"]',
  });
  assert.deepEqual(query.labels.types, ["体验"]);
  assert.deepEqual(query.creators, ["林"]);
  assert.equal(directoryQueryParams(query).urgency, '["high","urgent"]');
  const invalid = readDirectoryQuery({
    types: "[4]",
    urgency: '["invalid"]',
    creator: '["bad\\nname"]',
    scope: "invalid",
    group: "invalid",
    view: "dependencies",
  });
  assert.deepEqual(directoryQueryParams(invalid), {
    states: '["active"]',
    creatorSelf: null,
    types: null,
    noTypes: null,
    urgency: null,
    creator: null,
    sort: null,
  });
  assert.equal(invalid.scope, "active");
  assert.equal(invalid.group, "status");
  assert.equal(invalid.view, "list");
});
test("processing groups prioritize confirmation, then blocked tasks and other waits, then normal progress", () => {
  const blocked = {
    title: "task",
    status: "blocked" as const,
    reason: "接口未就绪",
  };
  const confirming = change("confirming", {
    waitingFor: { kind: "confirmation", summary: "等待验收" },
    tasks: { T1: blocked },
  });
  const paused = change("paused", {
    waitingFor: { kind: "pause", summary: "暂停" },
  });
  const taskBlocked = change("blocked", { tasks: { T1: blocked } });
  const moving = change("moving");
  assert.equal(processingStatus(confirming), "confirmation");
  const groups = groupDirectoryChanges(
    [moving, paused, confirming, taskBlocked],
    readDirectoryQuery({}),
  );
  assert.deepEqual(
    groups.map((g) => [g.name, g.items.map((i) => i.id)]),
    [
      ["等待确认", ["confirming"]],
      ["受阻", ["paused", "blocked"]],
      ["推进中", ["moving"]],
    ],
  );
  assert.equal(
    groupDirectoryChanges(
      [moving, paused],
      readDirectoryQuery({ group: "none" }),
    ).length,
    1,
  );
});
test("creation and urgency ordering are deterministic and do not mutate the source", () => {
  const low = change("low", { urgency: "low" }, "2026-10-21T00:00:00Z");
  const urgent = change(
    "urgent",
    { urgency: "urgent" },
    "2026-10-19T00:00:00Z",
  );
  const normal = change("normal", {}, "2026-10-20T00:00:00Z");
  const source = [normal, urgent, low];
  assert.deepEqual(
    sortDirectoryChanges(source).map((g) => g.id),
    ["low", "normal", "urgent"],
  );
  assert.deepEqual(
    sortDirectoryChanges(source, true).map((g) => g.id),
    ["urgent", "normal", "low"],
  );
  assert.deepEqual(
    source.map((g) => g.id),
    ["normal", "urgent", "low"],
  );
});
test("completed records group by delivery without treating an invalid archive as completed", () => {
  const integrated = change("integrated", { status: "completed" });
  const released = change("released", { status: "completed" });
  const unknown = change("unknown", { status: "completed" });
  const invalid = change("invalid", { status: "completed" });
  invalid.candidates[0].validCompleted = false;
  assert.equal(matchesDirectoryScope(invalid, "completed"), false);
  const delivery = {
    integrated: { stage: "pendingRelease" } as Delivery,
    released: { stage: "releaseMerged" } as Delivery,
  };
  assert.deepEqual(
    groupDirectoryChanges(
      [released, unknown, integrated],
      readDirectoryQuery({ scope: "completed" }),
      delivery,
    ).map((g) => [g.name, g.items.map((i) => i.id)]),
    [
      ["待发布", ["integrated"]],
      ["交付待核实", ["unknown"]],
    ],
  );
});

test("released records are archived; multi-state filters share classification and retain valid legacy links", () => {
  const active = change("active"),
    done = change("done", { status: "completed" }),
    shipped = change("shipped", { status: "completed" }),
    cancelled = change("cancelled", { status: "cancelled" });
  const delivery = { shipped: { stage: "releaseMerged" } as Delivery };
  const all = [active, done, shipped, cancelled];
  assert.deepEqual(
    filterDirectoryChanges(
      all,
      readDirectoryQuery({ scope: "completed" }),
      delivery,
    ).map((g) => g.id),
    ["done"],
  );
  const query = readDirectoryQuery({
    states: '["active","archived","active"]',
  });
  assert.deepEqual(
    filterDirectoryChanges(all, query, delivery).map((g) => g.id),
    ["active", "shipped"],
  );
  assert.deepEqual(
    groupDirectoryChanges([active, shipped], query, delivery).map(
      (g) => g.name,
    ),
    ["进行中 · 推进中", "已归档"],
  );
  assert.equal(
    filterDirectoryChanges(all, readDirectoryQuery({ states: "[]" }), delivery)
      .length,
    4,
  );
  assert.deepEqual(readDirectoryQuery({ scope: "pendingRelease" }).states, [
    "completed",
  ]);
  assert.deepEqual(
    readDirectoryQuery({ states: '["bad"]', scope: "archived" }).states,
    ["archived"],
  );
  assert.deepEqual(
    readDirectoryQuery(directoryQueryParams(query) as Record<string, string>)
      .states,
    ["active", "archived"],
  );
  assert.equal(
    matchesDirectoryScope(shipped, "archived", delivery.shipped),
    true,
  );
  assert.equal(matchesDirectoryScope(shipped, "archived"), false);
  shipped.candidates[0].state!.deliveryOverride = "releaseMerged";
  assert.equal(matchesDirectoryScope(shipped, "archived"), true);
  shipped.candidates[0].validCompleted = false;
  assert.equal(
    matchesDirectoryScope(shipped, "archived", delivery.shipped),
    false,
  );
});

test("self matches only numeric GitHub identity; fixed authors remain an OR alternative", () => {
  const mine = change("mine"),
    renamed = change("renamed"),
    conflict = change("conflict"),
    legacy = change("legacy");
  mine.creator = { name: "Lin", login: "lin", subjectId: "42" };
  renamed.creator = { name: "Lin", login: "old-login", subjectId: "42" };
  conflict.creator = { name: "Lin", login: "lin", subjectId: "99" };
  legacy.creator = { name: "Lin", login: "lin" };
  const all = [mine, renamed, conflict, legacy],
    query = readDirectoryQuery({ creatorSelf: "1" });
  assert.deepEqual(
    filterDirectoryChanges(
      all,
      query,
      {},
      { providerId: "github", subjectId: "42" },
    ).map((g) => g.id),
    ["mine", "renamed"],
  );
  assert.equal(filterDirectoryChanges(all, query).length, 0);
  assert.equal(
    filterDirectoryChanges(
      all,
      query,
      {},
      { providerId: "other", subjectId: "42" },
    ).length,
    0,
  );
  assert.equal(
    filterDirectoryChanges(
      all,
      { ...query, creators: ["lin"] },
      {},
      { providerId: "github", subjectId: "42" },
    ).length,
    4,
  );
});
