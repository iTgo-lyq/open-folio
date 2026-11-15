import test from "node:test";
import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import { join } from "node:path";
import { integrationFixture } from "./integration-fixture.ts";
import { GitReader } from "../src/server/git.ts";
import { SnapshotStore } from "../src/server/store.ts";
import { AppError } from "../src/server/errors.ts";
import { DEFAULT_LIMITS, primaryRecord } from "../src/lib/model.ts";

const gate = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

test("cold sources share one fetch batch and unchanged warm sources need no fetch", async (t) => {
  const f = await integrationFixture();
  t.after(f.cleanup);
  await f.register({ another: "change/another" });
  f.git(["checkout", "-b", "change/another", "develop"]);
  await f.put(
    "docs/project/changes/another/requirement.md",
    "# Another change\n",
  );
  f.commit();
  const calls: string[][] = [];
  class Reader extends GitReader {
    override run(
      args: string[],
      signal?: AbortSignal,
      limit?: number,
      input?: string | Buffer,
    ) {
      calls.push(args);
      return super.run(args, signal, limit, input);
    }
  }
  const store = new SnapshotStore(
    join(f.root, "batched"),
    (dir) => new Reader(dir, f.remote, "file"),
    f.project.id,
  );
  const first = await store.refresh(f.project, DEFAULT_LIMITS, f.context);
  assert.equal(
    primaryRecord(first.changes.find((change) => change.id === "example")!)
      ?.commit,
    f.source,
  );
  const fetches = calls.filter((args) => args[0] === "fetch");
  assert.equal(fetches.length, 2);
  assert.ok(fetches[1].includes("--atomic"));
  assert.ok(fetches[1].includes("+refs/heads/main:refs/remotes/origin/main"));
  assert.ok(
    fetches[1].includes(
      `+refs/heads/${f.branch}:refs/remotes/origin/${f.branch}`,
    ),
  );
  assert.ok(
    fetches[1].includes(
      "+refs/heads/change/another:refs/remotes/origin/change/another",
    ),
  );
  assert.equal(calls.filter((args) => args[0] === "ls-remote").length, 3);
  calls.length = 0;
  assert.equal(
    (await store.refresh(f.project, DEFAULT_LIMITS, f.context)).id,
    first.id,
  );
  assert.equal(calls.filter((args) => args[0] === "fetch").length, 0);
});

test("a branch advancing after advertisement uses the fetched commit without fetching twice", async (t) => {
  const f = await integrationFixture();
  t.after(f.cleanup);
  let advanced = "",
    fetches = 0;
  class Reader extends GitReader {
    override async run(
      args: string[],
      signal?: AbortSignal,
      limit?: number,
      input?: string | Buffer,
    ) {
      if (args[0] === "fetch") {
        fetches++;
        if (args.includes("--atomic") && !advanced) {
          await f.put(
            `${f.archivePath}/requirement.md`,
            "# Updated delivery\n",
          );
          advanced = f.commit();
        }
      }
      return super.run(args, signal, limit, input);
    }
  }
  const store = new SnapshotStore(
    join(f.root, "advanced"),
    (dir) => new Reader(dir, f.remote, "file"),
    f.project.id,
  );
  const result = await store.refresh(f.project, DEFAULT_LIMITS, f.context);
  assert.equal(primaryRecord(result.changes[0])?.commit, advanced);
  assert.equal(fetches, 2);
});

test("a release deleted during batch fetch does not discard readable working sources", async (t) => {
  const f = await integrationFixture();
  t.after(f.cleanup);
  const fetches: string[][] = [];
  let removed = false;
  class Reader extends GitReader {
    override async run(
      args: string[],
      signal?: AbortSignal,
      limit?: number,
      input?: string | Buffer,
    ) {
      if (args[0] === "fetch") {
        fetches.push(args);
        if (args.includes("--atomic") && !removed) {
          removed = true;
          f.git(["update-ref", "-d", "refs/heads/main"], f.remote);
        }
      }
      return super.run(args, signal, limit, input);
    }
  }
  const store = new SnapshotStore(
    join(f.root, "missing-release"),
    (dir) => new Reader(dir, f.remote, "file"),
    f.project.id,
  );
  const result = await store.refresh(f.project, DEFAULT_LIMITS, f.context);
  assert.equal(primaryRecord(result.changes[0])?.commit, f.source);
  assert.equal(result.releaseSource?.commit, null);
  assert.match(result.releaseSource?.message ?? "", /不可读取/);
  assert.equal(fetches.length, 3);
  assert.ok(!fetches[2].some((arg) => arg.includes("refs/heads/main")));
});

test(
  "PR reading overlaps Git, does not block the current list, and is reused by history",
  { timeout: 10_000 },
  async (t) => {
    const f = await integrationFixture();
    t.after(f.cleanup);
    const gitStarted = gate(),
      gitContinue = gate(),
      prStarted = gate(),
      prContinue = gate(),
      current = gate();
    let requests = 0;
    class Reader extends GitReader {
      override async run(
        args: string[],
        signal?: AbortSignal,
        limit?: number,
        input?: string | Buffer,
      ) {
        if (args[0] === "ls-remote") {
          gitStarted.resolve();
          await gitContinue.promise;
        }
        return super.run(args, signal, limit, input);
      }
    }
    const store = new SnapshotStore(
      join(f.root, "overlap"),
      (dir) => new Reader(dir, f.remote, "file"),
      f.project.id,
    );
    let finished = false;
    const refresh = store
      .refresh(f.project, DEFAULT_LIMITS, {
        ...f.context,
        onCurrent: () => current.resolve(),
        delivery: {
          ...f.delivery,
          list: async (...args) => {
            requests++;
            prStarted.resolve();
            await prContinue.promise;
            return f.delivery.list(...args);
          },
        },
      })
      .then((result) => {
        finished = true;
        return result;
      });
    try {
      await Promise.all([gitStarted.promise, prStarted.promise]);
      gitContinue.resolve();
      await current.promise;
      assert.equal((await store.snapshot(f.project)).historyPending, true);
      assert.equal(finished, false);
      prContinue.resolve();
      assert.equal((await refresh).historyPending, undefined);
      assert.equal(requests, 1);
    } finally {
      gitContinue.resolve();
      prContinue.resolve();
      await refresh;
    }
  },
);

test("an early PR credential rejection prevents publishing and keeps its original error", async (t) => {
  const f = await integrationFixture();
  t.after(f.cleanup);
  await assert.rejects(
    f.store.refresh(f.project, DEFAULT_LIMITS, {
      ...f.context,
      delivery: {
        ...f.delivery,
        list: async () => {
          throw new AppError("TOKEN_INVALID", "Expired", 401);
        },
      },
    }),
    (error: { code?: string }) => error.code === "TOKEN_INVALID",
  );
  await assert.rejects(access(join(f.store.directory(), "current")));
  await assert.rejects(access(join(f.store.directory(), "pull-requests.json")));
});

test(
  "a failed Git collection aborts and settles the concurrent PR request",
  { timeout: 10_000 },
  async (t) => {
    const f = await integrationFixture();
    t.after(f.cleanup);
    const started = gate();
    let aborted = false;
    class Reader extends GitReader {
      override async collect(): ReturnType<GitReader["collect"]> {
        await started.promise;
        throw new AppError("GIT_READ_FAILED", "Cannot fetch", 503);
      }
    }
    const store = new SnapshotStore(
      join(f.root, "failed-git"),
      (dir) => new Reader(dir, f.remote, "file"),
      f.project.id,
    );
    await assert.rejects(
      store.refresh(f.project, DEFAULT_LIMITS, {
        ...f.context,
        delivery: {
          ...f.delivery,
          list: (_query, _cursor, signal) =>
            new Promise((_resolve, reject) => {
              signal.addEventListener(
                "abort",
                () => {
                  aborted = true;
                  reject(signal.reason);
                },
                { once: true },
              );
              started.resolve();
            }),
        },
      }),
      (error: { code?: string }) => error.code === "GIT_READ_FAILED",
    );
    assert.equal(aborted, true);
    await assert.rejects(access(join(store.directory(), "pull-requests.json")));
  },
);
