import { inspectIntegration } from "../.agents/skills/spec-trail/scripts/integration-records.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { integrationFixture } from "./integration-fixture.ts";
import { DEFAULT_LIMITS } from "../src/lib/model.ts";
import { classifyDirectoryState } from "../src/lib/change-directory.ts";
import { archiveTimeline } from "../src/lib/archive-timeline.ts";
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
        items: prs.filter((p) => !query.base || p.base.branch === query.base),
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

test("archive batches use the unique introduction PR, independently of change PRs and overrides", async (t) => {
  const f = await integrationFixture();
  t.after(f.cleanup);
  const m = f.merge();
  const snapshot = await f.store.refresh(f.project, DEFAULT_LIMITS);
  const r = remote();
  const releases = [
    {
      ...pr(8, true),
      state: "merged" as const,
      mergeCommit: oid("8"),
      mergedAt: "2026-10-27T08:00:00Z",
    },
    {
      ...pr(7, true),
      state: "merged" as const,
      mergeCommit: oid("7"),
      mergedAt: "2026-10-26T08:00:00Z",
    },
    {
      ...pr(6, true),
      state: "merged" as const,
      mergeCommit: oid("6"),
      mergedAt: "2026-10-25T08:00:00Z",
    },
    { ...pr(5, true), state: "merged" as const, mergeCommit: oid("5") },
  ];
  const changePr = { ...pr(), state: "merged" as const, mergeCommit: m };
  r.set([changePr, ...releases]);
  const input = {
    changes: snapshot.changes,
    integrationTip: snapshot.integrations.tip,
    integrationBranch: "develop",
    releaseSource: { branch: "main", commit: oid("a") },
    releaseArchives: {
      example: { status: "found" as const, introduction: oid("7") },
    },
    readIntegration: (commit: string, id: string) =>
      inspectIntegration(f.run, commit, id),
    reader: r.reader,
    signal: new AbortController().signal,
    ancestor: async (before: string) => before !== oid("6"),
  };
  const first = await collectDelivery(input);
  assert.equal(first.deliveryByChange.example.releaseMergedPrNumber, 7);
  const inferred = await collectDelivery({
    ...input,
    releaseVersions: { [oid("7")]: { status: "found", version: "2.3.4" } },
  });
  assert.equal(
    inferred.deliveryByChange.example.releasePrs.find((pr) => pr.number === 7)
      ?.version,
    "2.3.4",
  );
  for (const status of ["ambiguous", "unreadable", "unavailable"] as const) {
    const unknownVersion = await collectDelivery({
      ...input,
      releaseVersions: { [oid("7")]: { status } },
    });
    assert.equal(
      unknownVersion.deliveryByChange.example.releasePrs.find(
        (pr) => pr.number === 7,
      )?.version,
      undefined,
    );
    assert.equal(
      unknownVersion.deliveryByChange.example.stage,
      "releaseMerged",
    );
    assert.equal(
      unknownVersion.deliveryByChange.example.releaseMergedPrNumber,
      7,
    );
  }
  const record = input.changes[0].candidates.find(
    (c) => c.key === input.changes[0].primary,
  )!;
  record.state!.deliveryOverride = "releaseMerged";
  assert.equal(
    (await collectDelivery(input)).deliveryByChange.example
      .releaseMergedPrNumber,
    7,
  );
  r.set(releases);
  const missing = await collectDelivery(input);
  assert.equal(missing.deliveryByChange.example.stage, "releaseMerged");
  assert.equal(missing.deliveryByChange.example.releaseMergedPrNumber, 7);
  r.set([changePr, { ...releases[0], mergedAt: undefined }]);
  const undated = await collectDelivery(input);
  assert.equal(undated.deliveryByChange.example.stage, "releaseMerged");
  assert.equal(
    undated.deliveryByChange.example.releaseMergedPrNumber,
    undefined,
  );
  r.fail(new ProviderError("PR_READ_DENIED", "unavailable", 403));
  const stale = await collectDelivery({
    ...input,
    previous: first.deliveryByChange,
  });
  assert.equal(stale.deliveryByChange.example.releaseMergedPrNumber, undefined);
  r.fail();
  r.set([releases[1], { ...releases[1], number: 9 }]);
  const ambiguous = await collectDelivery(input);
  assert.equal(ambiguous.deliveryByChange.example.stage, "releaseMerged");
  assert.equal(
    ambiguous.deliveryByChange.example.releaseMergedPrNumber,
    undefined,
  );
});

test("published archives enter the archived tab without PRs; only their exact introduction PR supplies time", async (t) => {
  const f = await integrationFixture();
  t.after(f.cleanup);
  f.merge();
  f.git(["checkout", "main"]);
  f.git(["merge", "--no-ff", "develop", "-m", "Publish archives"]);
  f.git(["push", "origin", "main"]);
  const release = f.git(["rev-parse", "HEAD"]);
  const r = remote();
  const context = {
    signal: new AbortController().signal,
    delivery: r.reader,
    beforePublish: async () => {},
  };
  const refresh = () => f.store.refresh(f.project, DEFAULT_LIMITS, context);
  const unknown = (snapshot: Awaited<ReturnType<typeof refresh>>) => {
    const delivery = snapshot.deliveryByChange!.example;
    assert.equal(delivery.stage, "releaseMerged");
    assert.equal(
      classifyDirectoryState(snapshot.changes[0], delivery),
      "archived",
    );
    assert.equal(delivery.releaseMergedPrNumber, undefined);
    assert.equal(
      archiveTimeline(snapshot.changes, snapshot.deliveryByChange)[0].label,
      "合入时间未知",
    );
  };
  r.set([]);
  unknown(await refresh());
  r.fail(new ProviderError("PR_READ_DENIED", "PR inaccessible", 403));
  unknown(await refresh());
  r.fail();
  const published = {
    ...pr(10, true),
    body: "Release without metadata",
    state: "merged" as const,
    mergeCommit: release,
    mergedAt: "2026-10-28T00:00:00Z",
  };
  r.set([published]);
  const matched = await refresh();
  assert.equal(matched.deliveryByChange!.example.releaseMergedPrNumber, 10);
  assert.equal(matched.deliveryByChange!.example.releasePrs[0].number, 10);
  assert.equal(
    archiveTimeline(matched.changes, matched.deliveryByChange)[0].batches[0].pr!
      .number,
    10,
  );
  r.calls.length = 0;
  r.fail(new ProviderError("RATE_LIMITED", "PR rate limited", 429));
  unknown(await refresh());
  assert.equal(r.calls.length, 1);
  r.fail();
  const { writeFile } = await import("node:fs/promises");
  await writeFile(`${f.store.directory()}/pull-requests.json`, "broken cache");
  assert.equal(
    (await refresh()).deliveryByChange!.example.releaseMergedPrNumber,
    10,
  );
  // A later release also contains the archive, but did not introduce it.
  await f.put("later.txt", "later release");
  const later = f.commit();
  r.set([{ ...published, number: 11, mergeCommit: later }]);
  unknown(await refresh());
  r.set([{ ...published, mergedAt: undefined }]);
  unknown(await refresh());
  r.set([published, { ...published, number: 12 }]);
  unknown(await refresh());
  // The current main snapshot is authoritative after an archive removal.
  f.git(["rm", "-r", f.archivePath]);
  f.commit();
  assert.notEqual(
    (await refresh()).deliveryByChange!.example.stage,
    "releaseMerged",
  );
});

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
  assert.equal(checks, 2);
  const same = await f.store.refresh(f.project, DEFAULT_LIMITS, context);
  assert.equal(same.id, first.id);
  assert.equal(checks, 3);
  assert.deepEqual(r.calls, ["{}", "{}"]);
  r.set([{ ...pr(), state: "closed" }, pr(2)]);
  const rebuilt = await f.store.refresh(f.project, DEFAULT_LIMITS, context);
  assert.notEqual(rebuilt.id, first.id);
  assert.equal(checks, 4);
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

test("release archives survive deleted sources and PR body changes; PR claims alone do not prove release", async (t) => {
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
  assert.deepEqual(r.calls, ["{}"]);
  r.set([
    { ...pr(), state: "merged", mergeCommit: m },
    { ...pr(2, true), state: "merged", mergeCommit: oid("f") },
  ]);
  const unverified = await f.store.refresh(f.project, DEFAULT_LIMITS, context);
  assert.equal(unverified.deliveryByChange?.example.stage, "pendingRelease");
  assert.deepEqual(unverified.deliveryByChange?.example.releasePrs, []);
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
    undefined,
  );
  // Published archives remain released even when the PR omits their IDs.
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
    "releaseMerged",
  );
});

test("verified merged PR facts survive missing, ambiguous or unreadable diff indexes", async (t) => {
  const f = await integrationFixture();
  t.after(f.cleanup);
  const merge = f.merge();
  const snapshot = await f.store.refresh(f.project, DEFAULT_LIMITS);
  const r = remote();
  r.set([{ ...pr(), state: "merged", mergeCommit: merge }]);
  for (const record of [
    undefined,
    { status: "invalid" as const, message: "Ambiguous diff" },
    { status: "unavailable" as const, message: "Unreadable diff" },
  ]) {
    const result = await collectDelivery({
      changes: snapshot.changes,
      integrationTip: snapshot.integrations.tip,
      readIntegration: async () =>
        record ?? { status: "missing" as const, message: "No diff" },
      integrationBranch: "develop",
      releaseSource: snapshot.releaseSource!,
      reader: r.reader,
      signal: new AbortController().signal,
      ancestor: async (before, after) =>
        f.git(["merge-base", before, after]) === before,
    });
    assert.equal(result.deliveryByChange.example.stage, "pendingRelease");
    assert.equal(result.deliveryByChange.example.changePrs[0].state, "merged");
    assert.match(
      result.deliveryByChange.example.diagnostics.join(),
      /差异暂不可用/,
    );
  }
  r.set([{ ...pr(), state: "merged", mergeCommit: oid("f") }]);
  const unknown = await collectDelivery({
    changes: snapshot.changes,
    integrationTip: snapshot.integrations.tip,
    readIntegration: (commit: string, id: string) =>
      inspectIntegration(f.run, commit, id),
    integrationBranch: "develop",
    releaseSource: snapshot.releaseSource!,
    reader: r.reader,
    signal: new AbortController().signal,
    ancestor: async () => false,
  });
  assert.equal(unknown.deliveryByChange.example.stage, "unknown");
});

test("draft work, ambiguous matches, invalid M and incomplete pagination retain distinct facts", async (t) => {
  const f = await integrationFixture();
  t.after(f.cleanup);
  const snapshot = await f.store.refresh(f.project, DEFAULT_LIMITS);
  const r = remote();
  const input = {
    changes: snapshot.changes,
    integrationTip: snapshot.integrations.tip,
    readIntegration: (commit: string, id: string) =>
      inspectIntegration(f.run, commit, id),
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
  r.set([{ ...pr(), state: "merged", mergeCommit: oid("f") }]);
  const invalid = await collectDelivery({
    ...input,
    readIntegration: async () => ({
      status: "invalid" as const,
      message: "Invalid M",
    }),
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
    integrationTip: snapshot.integrations.tip,
    readIntegration: (commit: string, id: string) =>
      inspectIntegration(f.run, commit, id),
    integrationBranch: "develop",
    releaseSource: snapshot.releaseSource!,
    reader: r.reader,
    signal: new AbortController().signal,
    ancestor: async () => false,
  };
  const first = await collectDelivery(input);
  assert.equal(Object.keys(first.deliveryByChange).length, 138);
  assert.deepEqual(r.calls, ["{}"]);
  r.calls.length = 0;
  await collectDelivery({ ...input, previous: first.deliveryByChange });
  assert.equal(r.calls.length, 1);
  r.calls.length = 0;
  await collectDelivery({
    ...input,
    releaseSource: { ...input.releaseSource, branch: "develop" },
  });
  assert.equal(r.calls.length, 1);
});

test("PR rate limiting stops further API calls but publishes Git facts without advancing PR success", async (t) => {
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
  const beforeChecked = JSON.parse(await readFile(checkedPath, "utf8"));
  r.calls.length = 0;
  r.fail(new ProviderError("RATE_LIMITED", "GitHub rate limited", 429, "90"));
  const limited = await f.store.refresh(f.project, DEFAULT_LIMITS, context);
  assert.equal(r.calls.length, 1);
  assert.notEqual(limited.id, snapshot.id);
  assert.equal(limited.deliveryByChange!.example.stale, true);
  assert.match(
    limited.deliveryByChange!.example.diagnostics.join(),
    /rate limited/,
  );
  assert.equal(await readFile(cachePath, "utf8"), beforeCache);
  assert.equal(
    JSON.parse(await readFile(checkedPath, "utf8")).deliveryLastSuccess,
    beforeChecked.deliveryLastSuccess,
  );
  r.fail();
  await f.store.refresh(f.project, DEFAULT_LIMITS, context);
  assert.equal((await f.store.summary(f.project)).lastError, undefined);
});
