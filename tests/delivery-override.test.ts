import { inspectIntegration } from "../.agents/skills/spec-trail/scripts/integration-records.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { completedChange, integrationFixture } from "./integration-fixture.ts";
import { DEFAULT_LIMITS, primaryRecord } from "../src/lib/model.ts";
import { changeSchema } from "../src/server/schema.ts";
import { validateChange } from "../.agents/skills/spec-trail/scripts/state-schema.mjs";
import {
  collectDelivery,
  type DeliveryReader,
} from "../src/server/delivery.ts";
import {
  ProviderError,
  type ProviderPullRequest,
} from "../src/server/providers/types.ts";

const emptyReader: DeliveryReader = {
  repositoryId: "12",
  cacheKey: "test:12:v1",
  list: async () => ({ items: [], nextCursor: null }),
};
const context = {
  delivery: emptyReader,
  signal: new AbortController().signal,
  beforePublish: async () => {},
};

test("shared and server schemas allow only the explicit release override", () => {
  const record = completedChange("example");
  for (const value of [
    record,
    { ...record, deliveryOverride: "releaseMerged" },
  ]) {
    assert.deepEqual(validateChange(value), []);
    assert.equal(changeSchema.safeParse(value).success, true);
  }
  for (const deliveryOverride of [
    null,
    true,
    false,
    "",
    "released",
    "pendingRelease",
    {},
  ]) {
    const value = { ...record, deliveryOverride };
    assert.ok(
      validateChange(value).some((message: string) =>
        message.includes("/deliveryOverride"),
      ),
    );
    assert.equal(changeSchema.safeParse(value).success, false);
  }
});

test("only the integration archive overrides delivery; removal restores automatic calculation", async (t) => {
  const f = await integrationFixture();
  t.after(f.cleanup);
  const overridden = { ...f.record, deliveryOverride: "releaseMerged" };
  const path = `${f.archivePath}/change.json`;
  const refresh = () => f.store.refresh(f.project, DEFAULT_LIMITS, context);
  await f.put(path, JSON.stringify(overridden));
  f.commit();
  const working = await refresh();
  assert.equal(primaryRecord(working.changes[0])!.branch, f.branch);
  assert.equal(working.deliveryByChange!.example.stage, "pendingIntegration");

  f.git(["checkout", "main"]);
  await f.put(path, JSON.stringify(overridden));
  f.commit();
  assert.equal(
    (await refresh()).deliveryByChange!.example.stage,
    "pendingIntegration",
  );

  // Legacy integration deliberately has no SpecTrail merge record.
  f.git(["checkout", "develop"]);
  f.git(["merge", "--squash", f.branch]);
  f.commit();
  f.git(["push", "origin", "--delete", f.branch]);
  const central = await refresh();
  const candidate = primaryRecord(central.changes[0])!;
  assert.equal(candidate.branch, "develop");
  assert.equal(candidate.state!.branch, f.branch);
  assert.equal(candidate.validCompleted, true);
  assert.equal(central.integrations.records.example.status, "missing");
  assert.equal(central.deliveryByChange!.example.stage, "releaseMerged");
  assert.deepEqual(central.deliveryByChange!.example.changePrs, []);
  assert.deepEqual(central.deliveryByChange!.example.releasePrs, []);

  // The release-branch copy still has the override, but cannot supply it.
  await f.put(path, JSON.stringify(f.record));
  f.commit();
  const removed = await refresh();
  assert.notEqual(removed.id, central.id);
  assert.equal(removed.deliveryByChange!.example.stage, "pendingIntegration");

  await f.put(
    path,
    JSON.stringify({ ...f.record, deliveryOverride: "pendingRelease" }),
  );
  f.commit();
  const invalid = await refresh();
  assert.equal(primaryRecord(invalid.changes[0])!.validCompleted, true);
  assert.ok(
    primaryRecord(invalid.changes[0])!.diagnostics.some(
      (d) => d.code === "DELIVERY_OVERRIDE_INVALID",
    ),
  );
  assert.equal(invalid.deliveryByChange!.example.stage, "pendingIntegration");

  await f.put(path, JSON.stringify({ ...overridden, closure: {} }));
  f.commit();
  assert.notEqual(
    (await refresh()).deliveryByChange!.example.stage,
    "releaseMerged",
  );
});

test("a central override survives missing history and PR failures without bypassing repository access", async (t) => {
  const f = await integrationFixture();
  t.after(f.cleanup);
  await f.put(
    `${f.archivePath}/change.json`,
    JSON.stringify({ ...f.record, deliveryOverride: "releaseMerged" }),
  );
  f.commit();
  f.merge();
  const snapshot = await f.store.refresh(f.project, DEFAULT_LIMITS, context);
  const input = {
    changes: snapshot.changes,
    integrationBranch: "develop",
    releaseSource: {
      branch: "main",
      commit: null,
      message: "Release unavailable",
    },
    signal: context.signal,
    ancestor: async () => {
      throw Error("Override must not require ancestry");
    },
  };
  const reader = (code: string): DeliveryReader => ({
    ...emptyReader,
    list: async () => {
      throw new ProviderError(code, "Denied", 403);
    },
  });
  for (const status of ["missing", "invalid", "unavailable"] as const) {
    const integrations = {
      ...snapshot.integrations,
      records: { example: { status, message: "Legacy history" } },
    };
    const result = await collectDelivery({
      ...input,
      integrationTip: integrations.tip,
      readIntegration: async () => ({ status, message: "Legacy history" }),
      reader: reader("PR_READ_DENIED"),
    });
    assert.equal(result.deliveryByChange.example.stage, "releaseMerged");
    assert.equal(result.deliveryByChange.example.stale, true);
    assert.ok(result.deliveryByChange.example.diagnostics.includes("Denied"));
  }
  for (const code of ["TOKEN_INVALID", "READ_DENIED"]) {
    await assert.rejects(
      collectDelivery({
        ...input,
        integrationTip: snapshot.integrations.tip,
        readIntegration: (commit: string, id: string) =>
          inspectIntegration(f.run, commit, id),
        reader: reader(code),
      }),
      { code },
    );
  }

  const pr = (number: number): ProviderPullRequest => ({
    number,
    title: "Legacy PR",
    url: `https://github.com/demo/work/pull/${number}`,
    body: "Delivery\n\nSpecTrail-Change: example",
    state: "open",
    draft: false,
    base: { repositoryId: "12", branch: "develop", commit: f.base },
    head: { repositoryId: "12", branch: f.branch, commit: f.source },
    mergeCommit: null,
    updatedAt: "2026-10-22T00:00:00Z",
  });
  const ambiguous = await collectDelivery({
    ...input,
    integrationTip: snapshot.integrations.tip,
    readIntegration: (commit: string, id: string) =>
      inspectIntegration(f.run, commit, id),
    reader: {
      ...emptyReader,
      list: async (q) => ({
        items: q.base === "develop" ? [pr(1), pr(2)] : [],
        nextCursor: null,
      }),
    },
  });
  assert.equal(ambiguous.deliveryByChange.example.stage, "releaseMerged");
  assert.equal(ambiguous.deliveryByChange.example.changePrs.length, 2);
  assert.ok(
    ambiguous.deliveryByChange.example.diagnostics.some((d) =>
      d.includes("多个"),
    ),
  );
});

test("active or invalid candidates cannot become released through an override", async (t) => {
  const f = await integrationFixture();
  t.after(f.cleanup);
  const snapshot = await f.store.refresh(f.project, DEFAULT_LIMITS, context);
  for (const mutation of [
    { branch: "develop", validCompleted: false, archived: false },
    { branch: "develop", validCompleted: false, archived: true },
    { branch: "main", validCompleted: true, archived: true },
  ]) {
    const changes = structuredClone(snapshot.changes);
    const candidate = primaryRecord(changes[0])!;
    Object.assign(candidate, mutation);
    candidate.state!.deliveryOverride = "releaseMerged";
    const result = await collectDelivery({
      changes,
      integrationTip: snapshot.integrations.tip,
      readIntegration: (commit: string, id: string) =>
        inspectIntegration(f.run, commit, id),
      integrationBranch: "develop",
      releaseSource: snapshot.releaseSource!,
      reader: emptyReader,
      signal: context.signal,
      ancestor: async () => false,
    });
    assert.notEqual(result.deliveryByChange.example.stage, "releaseMerged");
  }
});
