import test from "node:test";
import assert from "node:assert/strict";
import { integrationFixture } from "./integration-fixture.ts";
import { DEFAULT_LIMITS } from "../src/lib/model.ts";
import {
  collectDelivery,
  type DeliveryReader,
} from "../src/server/delivery.ts";
import {
  ProviderError,
  type ProviderPullRequest,
} from "../src/server/providers/types.ts";
const oid = (c: string) => c.repeat(40);
function pr(number = 1, release = false): ProviderPullRequest {
  return {
    number,
    title: release ? "Release" : "Feature",
    url: `https://github.com/demo/work/pull/${number}`,
    body: release
      ? "Release\n\nSpecTrail-Version: 1.0\nSpecTrail-Includes: example"
      : "Feature\n\nSpecTrail-Change: example",
    state: "open",
    draft: false,
    base: {
      repositoryId: "12",
      branch: release ? "main" : "develop",
      commit: oid("a"),
    },
    head: {
      repositoryId: "12",
      branch: release ? "develop" : "change/example",
      commit: oid("b"),
    },
    mergeCommit: null,
    updatedAt: "2026-10-21T00:00:00Z",
  };
}
function remote() {
  let prs = [pr()];
  let error: ProviderError | undefined;
  const calls: string[] = [];
  const reader: DeliveryReader = {
    repositoryId: "12",
    cacheKey: "test:12:v1",
    async list(query) {
      calls.push(JSON.stringify(query));
      if (error) throw error;
      return {
        items: prs.filter((p) => p.base.branch === query.base),
        nextCursor: null,
      };
    },
  };
  return {
    reader,
    calls,
    set: (value: ProviderPullRequest[]) => {
      prs = value;
    },
    fail: (value?: ProviderError) => {
      error = value;
    },
  };
}

test("PR-only refreshes update snapshots, preserve close/reopen history and recheck publication permission", async (t) => {
  const f = await integrationFixture();
  t.after(f.cleanup);
  const r = remote();
  let checks = 0;
  const context = {
    signal: new AbortController().signal,
    delivery: r.reader,
    beforePublish: async () => {
      checks++;
    },
  };
  const first = await f.store.refresh(f.project, DEFAULT_LIMITS, context);
  assert.equal(first.deliveryByChange?.example.stage, "pendingIntegration");
  assert.equal(checks, 1);
  const same = await f.store.refresh(f.project, DEFAULT_LIMITS, context);
  assert.equal(same.id, first.id);
  assert.equal(checks, 2);
  assert.deepEqual(r.calls, [
    '{"base":"develop"}',
    '{"base":"main"}',
    '{"base":"develop"}',
    '{"base":"main"}',
  ]);
  r.set([{ ...pr(), state: "closed" }, pr(2)]);
  const rebuilt = await f.store.refresh(f.project, DEFAULT_LIMITS, context);
  assert.notEqual(rebuilt.id, first.id);
  assert.equal(checks, 3);
  assert.deepEqual(
    rebuilt.deliveryByChange?.example.changePrs.map((p) => [p.number, p.state]),
    [
      [2, "open"],
      [1, "closed"],
    ],
  );
  r.set([
    { ...pr(), title: "Renamed", state: "open" },
    { ...pr(2), state: "closed" },
  ]);
  const reopened = await f.store.refresh(f.project, DEFAULT_LIMITS, context);
  assert.equal(
    reopened.deliveryByChange?.example.changePrs.find((p) => p.number === 1)
      ?.title,
    "Renamed",
  );
  const success = (await f.store.workbench(f.project)).deliveryLastSuccess;
  assert.ok(success);
  r.fail(new ProviderError("PR_READ_DENIED", "需要 Pull requests: read", 403));
  const failed = await f.store.refresh(f.project, DEFAULT_LIMITS, context);
  assert.ok(failed.specs.length);
  assert.equal(failed.deliveryByChange?.example.stage, "unknown");
  assert.equal(failed.deliveryByChange?.example.stale, true);
  assert.equal(failed.deliveryByChange?.example.changePrs.length, 2);
  assert.equal(
    (await f.store.workbench(f.project)).deliveryLastSuccess,
    success,
  );
  r.fail(new ProviderError("TOKEN_INVALID", "expired", 401));
  await assert.rejects(f.store.refresh(f.project, DEFAULT_LIMITS, context), {
    code: "TOKEN_INVALID",
  });
});

test("cold base catalog survives deleted sources; release inclusion also requires real Git ancestry", async (t) => {
  const f = await integrationFixture();
  t.after(f.cleanup);
  const m = f.merge();
  f.git(["push", "origin", "--delete", f.branch]);
  const r = remote();
  r.set([{ ...pr(), state: "merged", mergeCommit: m }]);
  const context = {
    signal: new AbortController().signal,
    delivery: r.reader,
    beforePublish: async () => {},
  };
  const integrated = await f.store.refresh(f.project, DEFAULT_LIMITS, context);
  assert.equal(integrated.deliveryByChange?.example.stage, "pendingRelease");
  assert.deepEqual(r.calls, ['{"base":"develop"}', '{"base":"main"}']);
  r.set([
    { ...pr(), state: "merged", mergeCommit: m },
    { ...pr(2, true), state: "merged", mergeCommit: oid("f") },
  ]);
  const unverified = await f.store.refresh(f.project, DEFAULT_LIMITS, context);
  assert.equal(unverified.deliveryByChange?.example.stage, "unknown");
  assert.equal(
    unverified.deliveryByChange?.example.releasePrs[0].state,
    "merged",
  );
  f.git(["checkout", "main"]);
  f.git(["merge", "--no-ff", "develop", "-m", "Release 1.0"]);
  f.git(["push", "origin", "main"]);
  const release = f.git(["rev-parse", "HEAD"]);
  r.set([
    { ...pr(), state: "merged", mergeCommit: m },
    { ...pr(2, true), state: "merged", mergeCommit: release },
  ]);
  const delivered = await f.store.refresh(f.project, DEFAULT_LIMITS, context);
  assert.equal(delivered.deliveryByChange?.example.stage, "releaseMerged");
  assert.equal(
    delivered.deliveryByChange?.example.releasePrs[0].version,
    "1.0",
  );
  // Ancestry alone cannot invent semantic inclusion after the PR body changes.
  r.set([
    { ...pr(), state: "merged", mergeCommit: m },
    {
      ...pr(2, true),
      body: "Release\n\nSpecTrail-Version: 1.0\nSpecTrail-Includes: another",
      state: "merged",
      mergeCommit: release,
    },
  ]);
  assert.equal(
    (await f.store.refresh(f.project, DEFAULT_LIMITS, context)).deliveryByChange
      ?.example.stage,
    "pendingRelease",
  );
});

test("draft work, ambiguous matches, invalid M and incomplete pagination retain distinct facts", async (t) => {
  const f = await integrationFixture();
  t.after(f.cleanup);
  const snapshot = await f.store.refresh(f.project, DEFAULT_LIMITS);
  const r = remote();
  const input = {
    changes: snapshot.changes,
    integrations: snapshot.integrations,
    integrationBranch: "develop",
    releaseSource: snapshot.releaseSource!,
    reader: r.reader,
    signal: new AbortController().signal,
    ancestor: async () => false,
  };
  r.set([{ ...pr(), draft: true }]);
  const draftChanges = structuredClone(snapshot.changes);
  draftChanges[0].candidates[0].validCompleted = false;
  const draft = await collectDelivery({ ...input, changes: draftChanges });
  assert.equal(draft.deliveryByChange.example.stage, undefined);
  assert.equal(draft.deliveryByChange.example.changePrs[0].draft, true);
  r.set([pr(), pr(2)]);
  const ambiguous = await collectDelivery(input);
  assert.equal(ambiguous.deliveryByChange.example.stage, "unknown");
  assert.match(ambiguous.deliveryByChange.example.diagnostics.join(), /多个/);
  r.set([pr()]);
  const invalid = await collectDelivery({
    ...input,
    integrations: {
      ...snapshot.integrations,
      records: { example: { status: "invalid", message: "Invalid M" } },
    },
  });
  assert.equal(invalid.deliveryByChange.example.changePrs.length, 1);
  assert.equal(invalid.deliveryByChange.example.stage, "unknown");
  const incomplete = await collectDelivery({
    ...input,
    previous: invalid.deliveryByChange,
    reader: { ...r.reader, list: async () => ({ items: [], nextCursor: "2" }) },
  });
  assert.equal(incomplete.complete, false);
  assert.equal(incomplete.deliveryByChange.example.stale, true);
  assert.equal(incomplete.deliveryByChange.example.changePrs.length, 1);
  r.set([{ ...pr(), head: { ...pr().head, repositoryId: "99" } }]);
  assert.equal(
    (await collectDelivery(input)).deliveryByChange.example.changePrs.length,
    0,
  );
});

test("a new metadata snapshot cannot publish after a final permission denial", async (t) => {
  const f = await integrationFixture();
  t.after(f.cleanup);
  const r = remote();
  const signal = new AbortController().signal;
  const first = await f.store.refresh(f.project, DEFAULT_LIMITS, {
    signal,
    delivery: r.reader,
    beforePublish: async () => {},
  });
  r.set([{ ...pr(), title: "New metadata" }]);
  await assert.rejects(
    f.store.refresh(f.project, DEFAULT_LIMITS, {
      signal,
      delivery: r.reader,
      beforePublish: async () => {
        throw new ProviderError("READ_DENIED", "revoked", 403);
      },
    }),
    { code: "READ_DENIED" },
  );
  assert.equal((await f.store.snapshot(f.project)).id, first.id);
});

test("unrelated PR read failures do not erase verified delivery phases", async (t) => {
  const f = await integrationFixture();
  t.after(f.cleanup);
  const initial = await f.store.refresh(f.project, DEFAULT_LIMITS);
  const r = remote();
  const input = {
    changes: initial.changes,
    integrations: initial.integrations,
    integrationBranch: "develop",
    releaseSource: initial.releaseSource!,
    signal: new AbortController().signal,
    ancestor: async () => true,
  };
  const denied = () => {
    throw new ProviderError("PR_READ_DENIED", "PR permission missing", 403);
  };
  const waiting = await collectDelivery({
    ...input,
    reader: {
      ...r.reader,
      list: (q, c, s) =>
        q.base === "main" ? denied() : r.reader.list(q, c, s),
    },
  });
  assert.equal(waiting.deliveryByChange.example.stage, "pendingIntegration");
  assert.equal(waiting.deliveryByChange.example.changePrsStale, false);
  assert.equal(waiting.deliveryByChange.example.releasePrsStale, true);
  const m = f.merge();
  const integrated = await f.store.refresh(f.project, DEFAULT_LIMITS);
  r.set([{ ...pr(2, true), state: "merged", mergeCommit: m }]);
  const released = await collectDelivery({
    ...input,
    changes: integrated.changes,
    integrations: integrated.integrations,
    reader: {
      ...r.reader,
      list: (q, c, s) =>
        q.base !== "main" ? denied() : r.reader.list(q, c, s),
    },
  });
  assert.equal(released.deliveryByChange.example.stage, "releaseMerged");
  assert.equal(released.deliveryByChange.example.changePrsStale, true);
  assert.equal(released.deliveryByChange.example.releasePrsStale, false);
  assert.equal(released.deliveryByChange.example.releasePrs[0].state, "merged");
  assert.ok(
    !released.deliveryByChange.example.diagnostics.some((d) =>
      d.includes("尚无"),
    ),
  );
});

test("delivery request count depends on base pages, not the number or history of Changes", async (t) => {
  const f = await integrationFixture();
  t.after(f.cleanup);
  const snapshot = await f.store.refresh(f.project, DEFAULT_LIMITS);
  const r = remote();
  const changes = Array.from({ length: 138 }, (_, i) => ({
    ...snapshot.changes[0],
    id: `item-${i}`,
  }));
  const input = {
    changes,
    integrations: snapshot.integrations,
    integrationBranch: "develop",
    releaseSource: snapshot.releaseSource!,
    reader: r.reader,
    signal: new AbortController().signal,
    ancestor: async () => false,
  };
  const first = await collectDelivery(input);
  assert.equal(Object.keys(first.deliveryByChange).length, 138);
  assert.deepEqual(r.calls, ['{"base":"develop"}', '{"base":"main"}']);
  r.calls.length = 0;
  await collectDelivery({ ...input, previous: first.deliveryByChange });
  assert.equal(r.calls.length, 2);
  r.calls.length = 0;
  await collectDelivery({
    ...input,
    releaseSource: { ...input.releaseSource, branch: "develop" },
  });
  assert.equal(r.calls.length, 1);
});

test("rate limiting stops a refresh immediately and preserves snapshot, complete cache and success timestamps", async (t) => {
  const { readFile } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const f = await integrationFixture();
  t.after(f.cleanup);
  const r = remote();
  const context = {
    signal: new AbortController().signal,
    delivery: r.reader,
    beforePublish: async () => {},
  };
  const snapshot = await f.store.refresh(f.project, DEFAULT_LIMITS, context);
  const cachePath = join(f.store.directory(), "pull-requests.json");
  const checkedPath = join(f.store.directory(), "last-checked.json");
  const beforeCache = await readFile(cachePath, "utf8");
  const beforeChecked = await readFile(checkedPath, "utf8");
  r.calls.length = 0;
  r.fail(new ProviderError("RATE_LIMITED", "GitHub rate limited", 429, "90"));
  await assert.rejects(f.store.refresh(f.project, DEFAULT_LIMITS, context), {
    code: "RATE_LIMITED",
    retryAfter: "90",
  });
  assert.equal(r.calls.length, 1);
  assert.equal((await f.store.snapshot(f.project)).id, snapshot.id);
  assert.equal(await readFile(cachePath, "utf8"), beforeCache);
  assert.equal(await readFile(checkedPath, "utf8"), beforeChecked);
  assert.match((await f.store.summary(f.project)).lastError!, /rate limited/);
  r.fail();
  await f.store.refresh(f.project, DEFAULT_LIMITS, context);
  assert.equal((await f.store.summary(f.project)).lastError, undefined);
});
