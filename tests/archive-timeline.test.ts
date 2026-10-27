import test from "node:test";
import assert from "node:assert/strict";
import { archiveTimeline } from "../src/lib/archive-timeline.ts";
import type { ChangeGroup, Delivery, PullRequest } from "../src/lib/model.ts";
const changes = (...ids: string[]) => ids.map((id) => ({ id }) as ChangeGroup);
function delivery(number: number, mergedAt?: string): Delivery {
  return {
    stage: "releaseMerged",
    releaseMergedPrNumber: number,
    releasePrs: [{ number, mergedAt, state: "merged" } as PullRequest],
    changePrs: [],
    diagnostics: [],
    stale: false,
  };
}
test("archive dates use local merge days, group batches and preserve filtered member counts", () => {
  const data = {
    a: delivery(2, "2026-12-31T16:30:00Z"),
    b: delivery(2, "2026-12-31T16:30:00Z"),
    c: delivery(3, "2027-01-01T10:00:00Z"),
    d: delivery(1, "2026-12-31T15:00:00Z"),
  };
  const result = archiveTimeline(
    changes("d", "b", "a", "c"),
    data,
    "Asia/Shanghai",
  );
  assert.deepEqual(
    result.map((day) => [
      day.key,
      day.count,
      day.batches.map((b) => b.pr?.number),
    ]),
    [
      ["2027-01-01", 3, [3, 2]],
      ["2026-12-31", 1, [1]],
    ],
  );
  assert.deepEqual(
    result[0].batches[1].items.map((c) => c.id),
    ["b", "a"],
  );
  assert.equal(
    archiveTimeline(changes("a"), data, "Asia/Shanghai")[0].count,
    1,
  );
  assert.deepEqual(
    archiveTimeline(changes("a", "c"), data, "America/Los_Angeles").map(
      (day) => day.key,
    ),
    ["2027-01-01", "2026-12-31"],
  );
});
test("old snapshots and unverified, missing or invalid merge dates stay unknown without date fallbacks", () => {
  const unverified = delivery(4, "2026-10-27T00:00:00Z");
  delete unverified.releaseMergedPrNumber;
  const closed = delivery(5, "2026-10-27T00:00:00Z");
  closed.releasePrs[0].state = "closed";
  const data = {
    a: unverified,
    b: delivery(2),
    c: delivery(3, "invalid"),
    d: closed,
    e: delivery(6, "2026-10-27T00:00:00Z"),
  };
  const result = archiveTimeline(
    changes("a", "b", "c", "d", "e", "missing"),
    data,
    "UTC",
  );
  assert.deepEqual(
    result.map((day) => [day.key, day.count]),
    [
      ["2026-10-27", 1],
      ["unknown", 5],
    ],
  );
  assert.equal(result[1].batches[0].pr, undefined);
});
