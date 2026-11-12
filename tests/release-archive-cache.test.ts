import test from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { integrationFixture } from "./integration-fixture.ts";
import { DEFAULT_LIMITS } from "../src/lib/model.ts";
import { GitReader } from "../src/server/git.ts";
import { SnapshotStore } from "../src/server/store.ts";
import type { ProviderPullRequest } from "../src/server/providers/types.ts";

const releaseHistory = (args: string[]) =>
  args[0] === "log" &&
  args.includes("--first-parent") &&
  args.includes("--reverse") &&
  args.includes("docs/project/archive/");
const releaseTree = (args: string[]) =>
  args[0] === "ls-tree" &&
  args[1] === "-rlz" &&
  args.includes("docs/project/archive/") &&
  args.includes("docs/project/changes/") &&
  !args.includes("docs/project/workflow.json");

async function tracedRelease() {
  const f = await integrationFixture();
  const calls: string[][] = [];
  let unavailableHistory = false;
  class Reader extends GitReader {
    override run(args: string[], signal?: AbortSignal, limit?: number) {
      calls.push([...args]);
      if (unavailableHistory && releaseHistory(args))
        return Promise.reject(Error("Release history unavailable"));
      return super.run(args, signal, limit);
    }
  }
  const makeStore = () =>
    new SnapshotStore(
      join(f.root, "cache"),
      (dir) => new Reader(dir, f.remote, "file"),
      f.project.id,
    );
  const integrated = f.merge();
  f.git(["checkout", "main"]);
  const beforeRelease = f.git(["rev-parse", "HEAD"]);
  f.git(["merge", "--no-ff", "develop", "-m", "Publish archived delivery"]);
  f.git(["push", "origin", "main"]);
  const releaseCommit = f.git(["rev-parse", "HEAD"]);
  const releasePr: ProviderPullRequest = {
    number: 2,
    title: "Publish delivery",
    url: "https://github.com/demo/work/pull/2",
    body: "Publish delivery without SpecTrail markers.",
    state: "merged",
    draft: false,
    base: { repositoryId: "1", branch: "main", commit: beforeRelease },
    head: { repositoryId: "1", branch: "develop", commit: integrated },
    mergeCommit: releaseCommit,
    mergedAt: "2026-10-25T08:00:00Z",
    updatedAt: "2026-10-25T08:00:00Z",
  };
  f.pullRequests.push(releasePr);
  return {
    ...f,
    calls,
    beforeRelease,
    releaseCommit,
    releasePr,
    makeStore,
    store: makeStore(),
    failHistory: (fail: boolean) => {
      unavailableHistory = fail;
    },
    historyReads: () => calls.filter(releaseHistory),
    treeReads: () => calls.filter(releaseTree),
  };
}

test("complete release archive caches survive refresh and restart while PR metadata remains fresh", async (t) => {
  const f = await tracedRelease();
  t.after(f.cleanup);
  const first = await f.store.refresh(f.project, DEFAULT_LIMITS, f.context);
  assert.deepEqual(first.releaseArchives?.example, {
    status: "found",
    introduction: f.releaseCommit,
  });
  assert.equal(first.deliveryByChange?.example.stage, "releaseMerged");
  assert.equal(first.deliveryByChange?.example.releaseMergedPrNumber, 2);
  assert.equal(f.historyReads().length, 1);
  assert(f.treeReads().length > 0);

  f.calls.length = 0;
  const same = await f.store.refresh(f.project, DEFAULT_LIMITS, f.context);
  assert.equal(same.id, first.id);
  assert.deepEqual(f.historyReads(), []);
  assert.deepEqual(f.treeReads(), []);

  f.calls.length = 0;
  const restarted = f.makeStore();
  const restored = await restarted.refresh(
    f.project,
    DEFAULT_LIMITS,
    f.context,
  );
  assert.equal(restored.id, first.id);
  assert.deepEqual(restored.releaseArchives, first.releaseArchives);
  assert.deepEqual(f.historyReads(), []);
  assert.deepEqual(f.treeReads(), []);

  f.releasePr.body = "Publish delivery\n\nSpecTrail-Version: 1.2.3";
  f.releasePr.mergedAt = "2026-10-26T09:30:00Z";
  f.releasePr.updatedAt = "2026-10-27T00:00:00Z";
  f.calls.length = 0;
  const updated = await restarted.refresh(f.project, DEFAULT_LIMITS, f.context);
  assert.notEqual(updated.id, restored.id);
  assert.deepEqual(updated.releaseArchives, first.releaseArchives);
  assert.equal(updated.deliveryByChange?.example.releaseMergedPrNumber, 2);
  const pr = updated.deliveryByChange?.example.releasePrs.find(
    (pr) => pr.number === 2,
  );
  assert.equal(pr?.version, "1.2.3");
  assert.equal(pr?.mergedAt, "2026-10-26T09:30:00Z");
  assert.deepEqual(f.historyReads(), []);
  assert.deepEqual(f.treeReads(), []);
});

test("release tip changes and force-pushed archive removal invalidate cached delivery evidence", async (t) => {
  const f = await tracedRelease();
  t.after(f.cleanup);
  const first = await f.store.refresh(f.project, DEFAULT_LIMITS, f.context);

  await f.put("release-notes.txt", "An unrelated release branch change\n");
  const advanced = f.commit();
  f.calls.length = 0;
  const updated = await f.store.refresh(f.project, DEFAULT_LIMITS, f.context);
  assert.notEqual(updated.id, first.id);
  assert.equal(updated.releaseSource?.commit, advanced);
  assert.deepEqual(updated.releaseArchives?.example, {
    status: "found",
    introduction: f.releaseCommit,
  });
  assert.equal(updated.deliveryByChange?.example.stage, "releaseMerged");
  assert.equal(f.historyReads().length, 1);
  assert(f.treeReads().some((args) => args.includes(advanced)));

  f.git(["reset", "--hard", f.beforeRelease]);
  f.git(["push", "--force", "origin", "main"]);
  f.calls.length = 0;
  const removed = await f
    .makeStore()
    .refresh(f.project, DEFAULT_LIMITS, f.context);
  assert.equal(removed.releaseSource?.commit, f.beforeRelease);
  assert.deepEqual(removed.releaseArchives, {});
  assert.equal(removed.deliveryByChange?.example.stage, "pendingRelease");
  assert.equal(
    removed.deliveryByChange?.example.releaseMergedPrNumber,
    undefined,
  );
  assert(f.treeReads().some((args) => args.includes(f.beforeRelease)));
});

test("incomplete release provenance is retried after restart without withdrawing the archive", async (t) => {
  const f = await tracedRelease();
  t.after(f.cleanup);
  f.failHistory(true);
  const incomplete = await f.store.refresh(
    f.project,
    DEFAULT_LIMITS,
    f.context,
  );
  assert.equal(incomplete.releaseArchives?.example.status, "found");
  assert.equal(incomplete.releaseArchives?.example.introduction, undefined);
  assert.equal(incomplete.deliveryByChange?.example.stage, "releaseMerged");
  assert.equal(
    incomplete.deliveryByChange?.example.releaseMergedPrNumber,
    undefined,
  );
  assert.equal(f.historyReads().length, 1);

  f.failHistory(false);
  f.calls.length = 0;
  const restarted = f.makeStore();
  const complete = await restarted.refresh(
    f.project,
    DEFAULT_LIMITS,
    f.context,
  );
  assert.notEqual(complete.id, incomplete.id);
  assert.deepEqual(complete.releaseArchives?.example, {
    status: "found",
    introduction: f.releaseCommit,
  });
  assert.equal(complete.deliveryByChange?.example.stage, "releaseMerged");
  assert.equal(complete.deliveryByChange?.example.releaseMergedPrNumber, 2);
  assert.equal(f.historyReads().length, 1);
  assert(f.treeReads().length > 0);

  f.calls.length = 0;
  const cached = await restarted.refresh(f.project, DEFAULT_LIMITS, f.context);
  assert.equal(cached.id, complete.id);
  assert.deepEqual(f.historyReads(), []);
  assert.deepEqual(f.treeReads(), []);
});
