import test from "node:test";
import assert from "node:assert/strict";
import {
  readLabelQuery,
  labelQueryParams,
  matchesLabels,
  sortByUrgency,
} from "../src/lib/change-labels.ts";
import { type ChangeGroup, type ChangeState } from "../src/lib/model.ts";

const state = (labels: Partial<ChangeState> = {}): ChangeState => ({
  schemaVersion: 1,
  id: "example",
  title: "Example",
  branch: "develop",
  size: "small",
  status: "active",
  stage: "requirement",
  confirmations: {},
  tasks: {},
  closure: {},
  ...labels,
});

test("label queries round trip arbitrary names without delimiters or reserved values", () => {
  const types = ["修复", '逗号,和"引号', "none", "<img src=x>"];
  const query = readLabelQuery({
    types: JSON.stringify([...types, types[0]]),
    noTypes: "1",
    urgency: "normal",
    sort: "urgency",
  });
  assert.deepEqual(query.types, types);
  const params = new URLSearchParams(
    labelQueryParams(query) as Record<string, string>,
  );
  assert.deepEqual(readLabelQuery(Object.fromEntries(params)), query);
  for (const types of [
    "oops",
    '[""]',
    '[" 修复"]',
    '["a\\nb"]',
    "[42]",
    "{}",
  ]) {
    assert.deepEqual(
      labelQueryParams(
        readLabelQuery({
          types,
          noTypes: "0",
          urgency: "none",
          sort: "invalid",
        }),
      ),
      { types: null, noTypes: null, urgency: null, sort: null },
    );
  }
  assert.equal(readLabelQuery({ urgency: "toString" }).urgency, "");
});

test("type selections and no-types are OR, with effective urgency applied as AND", () => {
  const query = readLabelQuery({
    types: '["修复","none"]',
    noTypes: "1",
    urgency: "normal",
  });
  assert.equal(matchesLabels(state({ types: ["修复", "体验"] }), query), true);
  assert.equal(
    matchesLabels(state({ types: ["none"], urgency: "normal" }), query),
    true,
  );
  assert.equal(matchesLabels(state({ types: [] }), query), true);
  assert.equal(matchesLabels(state(), query), true);
  assert.equal(matchesLabels(state({ types: ["体验"] }), query), false);
  assert.equal(matchesLabels(state({ urgency: "high" }), query), false);
  assert.equal(matchesLabels(null, query), false);
  assert.equal(matchesLabels(null, readLabelQuery({})), true);
});

test("urgency sorting is stable, leaves the source intact and co-ranks absent and normal", () => {
  const group = (id: string, value: ChangeState | null) =>
    ({
      id,
      primary: id,
      candidates: [{ key: id, state: value }],
    }) as ChangeGroup;
  const groups = [
    group("old", state()),
    group("low", state({ urgency: "low" })),
    group("high-new", state({ urgency: "high" })),
    group("normal", state({ urgency: "normal" })),
    group("urgent", state({ urgency: "urgent" })),
    group("high-old", state({ urgency: "high" })),
    group("unreadable", null),
  ];
  const before = structuredClone(groups);
  assert.deepEqual(
    sortByUrgency(groups).map((g) => g.id),
    ["urgent", "high-new", "high-old", "old", "normal", "low", "unreadable"],
  );
  assert.deepEqual(groups, before);
});
