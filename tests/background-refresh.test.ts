import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  RepositoryRefresher,
  IDLE_REFRESH_MS,
  noteRepositoryActivity,
} from "../src/server/background-refresh.ts";
import { AUTO_REFRESH_MS, DEFAULT_LIMITS } from "../src/lib/model.ts";
import type { Repositories } from "../src/server/repositories.ts";
import { repositoryFixture } from "./repositories-fixture.ts";

function schedulerFixture() {
  let now = 0;
  const bindings = ["one", "two"].map((workspaceId) => ({
    workspaceId,
    accountId: workspaceId,
  }));
  const calls: string[] = [];
  const errors: unknown[] = [];
  const sources = new Map([
    ["one", ["develop", "other"]],
    ["two", ["develop"]],
  ]);
  let operation = async () => {};
  const repos = {
    root: randomUUID(),
    sessions: { repositoryBindings: async () => bindings },
    discoveries: {
      knownRepositories: async (workspace: string) =>
        (sources.get(workspace) ?? []).map((integrationBranch) => ({
          key: "repository",
          integrationBranch,
          repository: {},
        })),
    },
    readShared: async (
      account: string,
      _workspace: string,
      _key: string,
      _target: unknown,
      branch: string,
    ) => {
      calls.push(`${account}/${branch}`);
      await operation();
    },
  } as unknown as Repositories;
  const worker = new RepositoryRefresher(repos, {
    now: () => now,
    limits: async () => DEFAULT_LIMITS,
    onError: (error) => errors.push(error),
  });
  return {
    repos,
    worker,
    calls,
    errors,
    bindings,
    sources,
    advance: (ms: number) => {
      now += ms;
    },
    active: (workspace = "one", branch = "develop") =>
      noteRepositoryActivity(repos.root, workspace, "repository", branch, now),
    operation: (value: () => Promise<void>) => {
      operation = value;
    },
  };
}

test("idle scanning waits five minutes; page activity speeds up only its binding and source", async () => {
  const f = schedulerFixture();
  try {
    await f.worker.scan();
    assert.equal(f.calls.length, 3);
    f.advance(AUTO_REFRESH_MS);
    await f.worker.scan();
    assert.equal(f.calls.length, 3);
    f.active();
    await f.worker.scan();
    assert.deepEqual(f.calls.slice(3), ["one/develop"]);
    f.advance(AUTO_REFRESH_MS);
    f.active();
    await f.worker.scan();
    assert.deepEqual(f.calls.slice(3), ["one/develop", "one/develop"]);
    f.advance(2 * AUTO_REFRESH_MS);
    await f.worker.scan();
    assert.equal(f.calls.length, 5);
    f.advance(AUTO_REFRESH_MS);
    await f.worker.scan();
    assert.deepEqual(f.calls.slice(5).sort(), ["one/other", "two/develop"]);
    f.advance(2 * AUTO_REFRESH_MS);
    await f.worker.scan();
    assert.equal(f.calls.at(-1), "one/develop");
    assert.equal(f.errors.length, 0);
  } finally {
    f.worker.stop();
  }
});

test("scans bound concurrency, merge overlapping rounds and stop queued work", async () => {
  const f = schedulerFixture();
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  f.operation(() => held);
  const first = f.worker.scan();
  assert.equal(f.worker.scan(), first);
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(f.calls.length, 2);
  f.worker.stop();
  release();
  await first;
  f.advance(IDLE_REFRESH_MS);
  await f.worker.scan();
  assert.equal(f.calls.length, 2);
});

test("broken workspaces and failed repositories do not block healthy targets; failures retry", async () => {
  const f = schedulerFixture();
  const known = f.repos.discoveries.knownRepositories.bind(f.repos.discoveries);
  f.repos.discoveries.knownRepositories = async (workspace) => {
    if (workspace === "one") throw Error("broken discovery cache");
    return known(workspace);
  };
  f.operation(async () => {
    throw Error("temporary network failure");
  });
  try {
    await f.worker.scan();
    assert.deepEqual(f.calls, ["two/develop"]);
    assert.equal(f.errors.length, 2);
    f.operation(async () => {});
    f.advance(IDLE_REFRESH_MS);
    await f.worker.scan();
    assert.deepEqual(f.calls, ["two/develop", "two/develop"]);
    f.sources.clear();
    await f.worker.scan();
    assert.equal(f.calls.length, 2);
  } finally {
    f.worker.stop();
  }
});

test("startup schedules without page requests, survives failures, and leaves no timer after stop", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const f = schedulerFixture();
  const bindings = f.repos.sessions.repositoryBindings.bind(f.repos.sessions);
  let fail = true;
  f.repos.sessions.repositoryBindings = async () => {
    if (fail) {
      fail = false;
      throw Error("temporary state read failure");
    }
    return bindings();
  };
  f.worker.start();
  f.worker.start();
  await assert.rejects(f.worker.scan());
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(f.errors.length, 1);
  assert.equal(f.calls.length, 0);
  f.advance(IDLE_REFRESH_MS);
  t.mock.timers.tick(AUTO_REFRESH_MS);
  await f.worker.scan();
  assert.equal(f.calls.length, 3);
  f.worker.stop();
  f.advance(IDLE_REFRESH_MS);
  t.mock.timers.tick(IDLE_REFRESH_MS);
  await f.worker.scan();
  assert.equal(f.calls.length, 3);
});

test("page refresh requests register activity and removing the binding stops future scans", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: Date.now() });
  const f = await repositoryFixture();
  const readShared = f.service.readShared.bind(f.service);
  let checks = 0;
  f.service.readShared = async (...args) => {
    checks++;
    return readShared(...args);
  };
  const worker = new RepositoryRefresher(f.service, {
    limits: async () => DEFAULT_LIMITS,
  });
  try {
    await worker.scan();
    assert.equal(checks, 1);
    t.mock.timers.tick(AUTO_REFRESH_MS);
    assert.equal((await f.request("refresh?automatic=1", "POST")).status, 200);
    await worker.scan();
    assert.equal(checks, 2);
    t.mock.timers.tick(2 * AUTO_REFRESH_MS);
    await worker.scan();
    assert.equal(checks, 2);
    t.mock.timers.tick(3 * AUTO_REFRESH_MS);
    await worker.scan();
    assert.equal(checks, 3);
    await f.f.sessions.unbind(f.c.cookie, f.c.connection.id);
    t.mock.timers.tick(IDLE_REFRESH_MS);
    await worker.scan();
    assert.equal(checks, 3);
  } finally {
    worker.stop();
    await f.cleanup();
  }
});

test("without a browser or valid device cookie the worker refreshes pushed Specs and Changes, then recovers on restart", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: Date.now() });
  const f = await repositoryFixture();
  const errors: unknown[] = [];
  const makeWorker = () =>
    new RepositoryRefresher(f.service, {
      limits: async () => DEFAULT_LIMITS,
      onError: (error) => errors.push(error),
    });
  let worker = makeWorker();
  const [binding] = await f.f.sessions.repositoryBindings();
  const read = <T>(operation: Parameters<Repositories["readShared"]>[5]) =>
    f.service.readShared(
      binding.accountId,
      binding.workspaceId,
      f.key,
      f.repo,
      "develop",
      operation,
    ) as Promise<T>;
  const snapshot = () =>
    read<{ id: string; changes: { id: string }[] }>((ctx) =>
      ctx.store.workbench(ctx.project),
    );
  try {
    await f.f.sessions.remove(f.c.cookie);
    await worker.scan();
    const first = await snapshot();
    await f.g.put(
      "docs/project/specs/platform/spec.md",
      "# 无人打开页面时推送的新能力\n",
    );
    await f.g.put(
      "docs/project/changes/background-added/change.json",
      JSON.stringify({
        schemaVersion: 1,
        id: "background-added",
        title: "后台发现的新 Change",
        size: "small",
        status: "active",
        stage: "requirement",
        branch: "develop",
        confirmations: {},
        tasks: {},
        closure: {},
      }),
    );
    f.g.commit();
    t.mock.timers.tick(IDLE_REFRESH_MS - 1);
    await worker.scan();
    assert.equal((await snapshot()).id, first.id);
    t.mock.timers.tick(1);
    await worker.scan();
    const changed = await snapshot();
    assert.notEqual(changed.id, first.id);
    assert.ok(changed.changes.some((c) => c.id === "background-added"));
    const body = await read<Buffer>(async (ctx) => {
      const workbench = await ctx.store.workbench(ctx.project);
      const doc = workbench.documents.find(
        (d) => d.path === "docs/project/specs/platform/spec.md",
      )!;
      return (await ctx.store.document(ctx.project, doc.id, workbench.id)).body;
    });
    assert.match(body.toString(), /无人打开页面时推送的新能力/);
    f.f.controls.deny.add(f.repo.repositoryId);
    t.mock.timers.tick(IDLE_REFRESH_MS);
    await worker.scan();
    assert.equal(errors.length, 1);
    f.f.controls.deny.clear();
    assert.equal((await snapshot()).id, changed.id);
    worker.stop();
    worker = makeWorker();
    t.mock.timers.tick(IDLE_REFRESH_MS);
    await worker.scan();
    assert.equal((await snapshot()).id, changed.id);
    assert.equal(errors.length, 1);
  } finally {
    worker.stop();
    await f.cleanup();
  }
});
