import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { completedChange, integrationFixture } from "./integration-fixture.ts";
import { DEFAULT_LIMITS } from "../src/lib/model.ts";
import { collectReleaseArchives } from "../src/server/release-archives.ts";

type Fixture = Awaited<ReturnType<typeof integrationFixture>>;
const confirmation = {
  at: "2026-10-17T00:00:00.000Z",
  summary: "Confirmed delivery",
};
const confirmations = {
  requirement: confirmation,
  technical: confirmation,
  plan: confirmation,
};

function release(f: Fixture) {
  const integrated = f.merge();
  f.git(["checkout", "main"]);
  f.git(["merge", "--no-ff", "develop", "-m", "Release delivery"]);
  return { integrated, commit: f.git(["rev-parse", "HEAD"]) };
}

function readGit(f: Fixture, args: string[]) {
  return execFileSync("git", args, {
    cwd: f.author,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function archives(f: Fixture, ids = [f.id]) {
  return collectReleaseArchives(
    {
      run: async (args) => readGit(f, args),
    },
    { branch: "main", commit: f.git(["rev-parse", "main"]) },
    ids,
    DEFAULT_LIMITS,
    new AbortController().signal,
  );
}

test("release archives identify entry into main rather than development archive history", async (t) => {
  const f = await integrationFixture();
  t.after(f.cleanup);
  assert.deepEqual(await archives(f), {});
  const { integrated, commit } = release(f);
  const result = await archives(f);
  assert.deepEqual(result.example, { status: "found", introduction: commit });
  assert.notEqual(result.example.introduction, f.source);
  assert.notEqual(result.example.introduction, integrated);
  assert.deepEqual(await archives(f, ["unlisted"]), {});
});

test("invalid release archives never establish delivery", async (t) => {
  const cases: [string, (f: Fixture) => Promise<void>][] = [
    [
      "unsuccessful closure",
      async (f) => {
        const record = structuredClone(f.record);
        record.closure.verification.result = "failed";
        await f.put(`${f.archivePath}/change.json`, JSON.stringify(record));
      },
    ],
    [
      "duplicate archive identity",
      async (f) => {
        const record = structuredClone(f.record);
        record.closure.archive.path = "docs/project/archive/2026-10-19-example";
        await f.put(
          `${record.closure.archive.path}/change.json`,
          JSON.stringify(record),
        );
      },
    ],
    [
      "live file without change.json",
      async (f) => {
        await f.put("docs/project/changes/example/notes.txt", "Still live\n");
      },
    ],
    [
      "medium archive without Plan",
      async (f) => {
        await f.put(
          `${f.archivePath}/change.json`,
          JSON.stringify({ ...f.record, size: "medium", confirmations }),
        );
      },
    ],
    [
      "self dependency",
      async (f) => {
        await f.put(
          `${f.archivePath}/change.json`,
          JSON.stringify({ ...f.record, dependsOn: [f.id] }),
        );
      },
    ],
    [
      "self parent",
      async (f) => {
        await f.put(
          `${f.archivePath}/change.json`,
          JSON.stringify({ ...f.record, parent: f.id }),
        );
      },
    ],
    [
      "invalid archive calendar date",
      async (f) => {
        const record = structuredClone(f.record);
        record.closure.archive.path = "docs/project/archive/2026-99-99-example";
        f.git(["mv", f.archivePath, record.closure.archive.path]);
        await f.put(
          `${record.closure.archive.path}/change.json`,
          JSON.stringify(record),
        );
      },
    ],
    [
      "invalid-date duplicate beside a valid archive",
      async (f) => {
        const record = structuredClone(f.record);
        record.closure.archive.path = "docs/project/archive/2026-99-99-example";
        await f.put(
          `${record.closure.archive.path}/change.json`,
          JSON.stringify(record),
        );
      },
    ],
  ];
  for (const [name, mutate] of cases) {
    await t.test(name, async (t) => {
      const f = await integrationFixture();
      t.after(f.cleanup);
      release(f);
      await mutate(f);
      f.commit(false);
      const result = await archives(f);
      assert.equal(result.example.status, "invalid");
      assert.equal(result.example.introduction, undefined);
    });
  }
});

test("renaming a release archive preserves its first introduction by Change id", async (t) => {
  const f = await integrationFixture();
  t.after(f.cleanup);
  const { commit } = release(f);
  const path = "docs/project/archive/2026-10-20-example";
  f.git(["mv", f.archivePath, path]);
  const record = structuredClone(f.record);
  record.closure.archive.path = path;
  await f.put(`${path}/change.json`, JSON.stringify(record));
  const renamed = f.commit(false);
  const result = await archives(f);
  assert.deepEqual(result.example, { status: "found", introduction: commit });
  assert.notEqual(result.example.introduction, renamed);
});

test("unavailable first-parent history preserves a valid release archive without inventing provenance", async (t) => {
  const f = await integrationFixture();
  t.after(f.cleanup);
  const { commit } = release(f);
  let historyReads = 0;
  const result = await collectReleaseArchives(
    {
      run: async (args) => {
        if (args[0] === "log") {
          historyReads++;
          throw Error("History unavailable");
        }
        return readGit(f, args);
      },
    },
    { branch: "main", commit },
    [f.id],
    DEFAULT_LIMITS,
    new AbortController().signal,
  );
  assert.equal(historyReads, 1);
  assert.equal(result.example.status, "found");
  assert.equal(result.example.introduction, undefined);
  assert.match(result.example.message!, /历史暂不可核实/);
});

test("an invalid UTF-8 archive does not invalidate another archive in the same release snapshot", async (t) => {
  const f = await integrationFixture();
  t.after(f.cleanup);
  const { commit } = release(f);
  const broken = completedChange("broken");
  await f.put(
    `${broken.closure.archive.path}/change.json`,
    Buffer.from([0xc3, 0x28]),
  );
  f.commit(false);
  const result = await archives(f, [f.id, broken.id]);
  assert.deepEqual(result.example, { status: "found", introduction: commit });
  assert.equal(result.broken.status, "invalid");
  assert.equal(result.broken.introduction, undefined);
});

test("a released parent archive does not depend on a cancelled child's external branch", async (t) => {
  const f = await integrationFixture("parent");
  t.after(f.cleanup);
  await f.put(
    `${f.archivePath}/change.json`,
    JSON.stringify({
      ...f.record,
      size: "xlarge",
      confirmations,
      tasks: {},
      children: ["cancelled-child"],
    }),
  );
  const child = {
    schemaVersion: 1,
    id: "cancelled-child",
    title: "Cancelled child",
    branch: "change/cancelled-child",
    size: "small",
    status: "active",
    stage: "requirement",
    parent: "parent",
    confirmations: {},
    tasks: {},
    closure: {},
  };
  const childPath = "docs/project/changes/cancelled-child/change.json";
  await f.put(childPath, JSON.stringify(child));
  f.commit(false);
  f.git(["checkout", "-b", child.branch]);
  await f.put(
    childPath,
    JSON.stringify({
      ...child,
      status: "cancelled",
      cancellation: {
        at: "2026-10-18T00:00:00.000Z",
        reason: "Not needed",
      },
    }),
  );
  f.commit(false);
  f.git(["checkout", f.branch]);
  const { commit } = release(f);
  f.git(["branch", "-D", child.branch]);
  const result = await archives(f, ["parent", "cancelled-child"]);
  assert.deepEqual(result.parent, { status: "found", introduction: commit });
  assert.equal(result["cancelled-child"], undefined);
});
