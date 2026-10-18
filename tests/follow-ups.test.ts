import test from "node:test";
import assert from "node:assert/strict";
import { followUpIndex, matchingFollowUps } from "../src/lib/follow-ups.ts";
import {
  primaryRecord,
  type ChangeGroup,
  type ChangeState,
} from "../src/lib/model.ts";
import { changeSchema } from "../src/server/schema.ts";
import { validateChange } from "../.agents/skills/spec-trail/scripts/state-schema.mjs";

function group(
  id: string,
  followUpOf?: string,
  status: ChangeState["status"] = "completed",
): ChangeGroup {
  const state: ChangeState = {
    schemaVersion: 1,
    id,
    title: id,
    branch: `change/${id}`,
    size: "small",
    status,
    stage: "close",
    confirmations: {},
    tasks: {},
    closure: {},
    ...(followUpOf ? { followUpOf } : {}),
    ...(status === "cancelled"
      ? { cancellation: { at: "2026-10-18T00:00:00Z", reason: "取消" } }
      : {}),
  };
  return {
    id,
    title: id,
    primary: id,
    diagnostics: [],
    relations: [],
    candidates: [
      {
        key: id,
        id,
        title: id,
        branch: state.branch,
        commit: "abc1234",
        directory: "archive",
        archived: status === "completed",
        jsonDocumentId: id,
        documentIds: [],
        state,
        diagnostics: [],
        validCompleted: status === "completed",
        taskGraph: {
          status: "valid",
          source: "default",
          edges: {},
          diagnostics: [],
        },
        relatedSpecs: [],
        specReferences: [],
      },
    ],
  };
}

test("follow-up fields are optional and shared validators agree without changing dependencies", () => {
  const original = primaryRecord(group("next"))!.state!;
  for (const followUpOf of [
    undefined,
    "previous",
    "",
    "../previous",
    42,
    ["previous"],
  ]) {
    const state = {
      ...original,
      ...(followUpOf === undefined ? {} : { followUpOf }),
    };
    const valid = followUpOf === undefined || followUpOf === "previous";
    assert.equal(changeSchema.safeParse(state).success, valid);
    assert.equal(validateChange(state).length === 0, valid);
  }
  for (const followUpTitle of [
    undefined,
    "完善技术方案问询机制",
    "",
    "  ",
    "两行\n标题",
    42,
    null,
  ]) {
    const state = {
      ...original,
      followUpOf: "previous",
      ...(followUpTitle === undefined ? {} : { followUpTitle }),
    };
    const valid =
      followUpTitle === undefined || followUpTitle === "完善技术方案问询机制";
    assert.equal(changeSchema.safeParse(state).success, valid);
    assert.equal(validateChange(state).length === 0, valid);
  }
});

test("group titles survive filtering and ordering, inherit across branches and fall back for old records", () => {
  const root = group("root"),
    next = group("next", "root"),
    last = group("last", "next", "active"),
    sibling = group("sibling", "root", "cancelled");
  primaryRecord(next)!.state!.followUpTitle = "完善技术方案问询机制";
  const changes = [last, sibling, next, root];
  const before = structuredClone(changes);
  for (const ordered of [changes, [...changes].reverse()]) {
    for (const matched of [[root], [last], [sibling]]) {
      const index = matchingFollowUps(ordered, matched);
      assert.equal(index.titles.get("root"), "完善技术方案问询机制");
      assert.equal(index.titleProblems.size, 0);
    }
  }
  assert.deepEqual(changes, before);
  primaryRecord(last)!.state!.followUpTitle = "冲突名称";
  const conflicting = followUpIndex(changes);
  assert.equal(conflicting.titles.get("root"), "完善技术方案问询机制");
  assert(conflicting.titleProblems.has("root"));
  assert.equal(conflicting.groups.get("root")!.length, 4);
  delete primaryRecord(next)!.state!.followUpTitle;
  delete primaryRecord(last)!.state!.followUpTitle;
  assert.equal(followUpIndex(changes).titles.get("root"), root.title);
});

test("multi-hop and branching follow-ups form one group without mutating delivery records", () => {
  const changes = [
    group("last", "next", "active"),
    group("sibling", "root", "cancelled"),
    group("next", "root"),
    group("root"),
    group("unrelated"),
  ];
  const before = structuredClone(changes);
  const index = followUpIndex(changes);
  assert.equal(index.groups.size, 2);
  assert.equal(index.roots.get("last"), "root");
  assert.equal(index.groups.get("root")!.length, 4);
  assert.equal(index.groups.get("root")![0].id, "root");
  assert.equal(index.groups.get("root")!.at(-1)!.id, "last");
  assert.equal(index.problems.size, 0);
  assert.deepEqual(changes, before);
});

test("filtering members preserves active followers under an archived root", () => {
  const root = group("root"),
    next = group("next", "root", "active");
  const index = matchingFollowUps([root, next], [next]);
  assert.deepEqual([...index.visible.keys()], ["root"]);
  assert.deepEqual(
    index.visible.get("root")!.map((g) => g.id),
    ["next"],
  );
  assert.equal(index.groups.get("root")!.length, 2);
  const archived = matchingFollowUps([root, next], [root]);
  assert.deepEqual(
    archived.visible.get("root")!.map((g) => g.id),
    ["root"],
  );
  assert.equal(
    primaryRecord(archived.groups.get("root")![1])!.state!.status,
    "active",
  );
});

test("missing, invalid, self and cyclic relationships keep every affected record separately readable", () => {
  const changes = [
    group("missing", "absent"),
    group("self", "self"),
    group("a", "b"),
    group("b", "a"),
    group("tail", "a"),
    group("active", undefined, "active"),
    group("bad", "active"),
  ];
  const before = structuredClone(changes);
  const index = followUpIndex(changes);
  assert.equal(index.groups.size, changes.length);
  for (const id of ["missing", "self", "a", "b", "tail", "bad"]) {
    assert(index.problems.has(id), id);
    assert.equal(index.roots.get(id), id);
  }
  assert.deepEqual(changes, before);
});
