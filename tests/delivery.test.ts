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
  let deleted = false;
  const calls: string[] = [];
  const reader: DeliveryReader = {
    repositoryId: "12",
    async list(query) {
      calls.push(JSON.stringify(query));
      if (error) throw error;
      return {
        items: query.commit
          ? prs.filter((p) => p.mergeCommit === query.commit)
          : deleted && query.head
            ? []
            : prs.filter(
                (p) =>
                  (!query.base || p.base.branch === query.base) &&
                  (!query.head || p.head.branch === query.head),
              ),
        nextCursor: null,
      };
    },
    async get(number) {
      calls.push(`#${number}`);
      if (error) throw error;
      return prs.find((p) => p.number === number)!;
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
    deleteSource: () => {
      deleted = true;
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
  assert.equal(checks, 1);
  assert.ok(r.calls.includes("#1"));
  r.set([{ ...pr(), state: "closed" }, pr(2)]);
  const rebuilt = await f.store.refresh(f.project, DEFAULT_LIMITS, context);
  assert.notEqual(rebuilt.id, first.id);
  assert.equal(checks, 2);
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

test("cold commit lookup survives deleted sources; release inclusion also requires real Git ancestry", async (t) => {
  const f = await integrationFixture();
  t.after(f.cleanup);
  const m = f.merge();
  f.git(["push", "origin", "--delete", f.branch]);
  const r = remote();
  r.deleteSource();
  r.set([{ ...pr(), state: "merged", mergeCommit: m }]);
  const context = {
    signal: new AbortController().signal,
    delivery: r.reader,
    beforePublish: async () => {},
  };
  const integrated = await f.store.refresh(f.project, DEFAULT_LIMITS, context);
  assert.equal(integrated.deliveryByChange?.example.stage, "pendingRelease");
  assert.ok(r.calls.some((call) => call.includes(`"commit":"${m}"`)));
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
