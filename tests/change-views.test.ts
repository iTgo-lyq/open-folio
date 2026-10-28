import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { personalFixture } from "./personal-fixture.ts";
import { repositoryFixture } from "./repositories-fixture.ts";
import { repositoryResponse } from "../src/server/repository-api.ts";
import {
  defaultRepositoryViews,
  queryFromUrl,
  queryToUrl,
  repositoryViewsSchema,
  sameQuery,
  savedChangeQuerySchema,
} from "../src/lib/change-views.ts";

test("view queries round trip explicit all states and display preferences with strict limits", () => {
  const record = defaultRepositoryViews();
  const query = {
    ...record.views[0].query,
    states: [],
    display: "board" as const,
    types: ["功能", "修复"],
    showCreator: true,
  };
  const url = Object.fromEntries(
    Object.entries(queryToUrl(query)).filter(
      (entry): entry is [string, string] => entry[1] !== null,
    ),
  );
  assert.ok(sameQuery(queryFromUrl(url), query));
  assert.ok(sameQuery(query, { ...query, types: ["修复", "功能"] }));
  assert.equal(
    savedChangeQuerySchema.safeParse({ ...query, states: ["deleted"] }).success,
    false,
  );
  assert.equal(
    repositoryViewsSchema.safeParse({
      ...record,
      views: [record.views[0], record.views[0]],
    }).success,
    false,
  );
  assert.equal(
    repositoryViewsSchema.safeParse({
      ...record,
      views: [{ ...record.views[0], name: "😀".repeat(40) }],
    }).success,
    true,
  );
  assert.equal(
    repositoryViewsSchema.safeParse({
      ...record,
      views: [{ ...record.views[0], name: "😀".repeat(41) }],
    }).success,
    false,
  );
});

test("legacy view queries default to a hidden creator column while preserving other preferences", () => {
  const query = {
    ...defaultRepositoryViews().views[0].query,
    display: "board" as const,
  };
  const { showCreator: _unused, ...legacy } = query;
  assert.deepEqual(savedChangeQuerySchema.parse(legacy), {
    ...query,
    showCreator: false,
  });
  assert.equal(queryFromUrl({ showCreator: "1" }).showCreator, true);
  assert.equal(queryFromUrl({ showCreator: "invalid" }).showCreator, false);
  assert.equal(sameQuery(query, { ...query, showCreator: true }), false);
});

test("account views initialize once, share across devices and tokens, isolate accounts/repos and enforce CAS", async (t) => {
  const f = await personalFixture();
  t.after(f.cleanup);
  const a = await f.connect(),
    b = await f.connect(),
    other = await f.connect("", "second");
  const call = async (
    cookie: string,
    method: string,
    body?: unknown,
    key = "repo-a",
    revision?: number,
  ) => {
    const lease = await f.sessions.lease(cookie, undefined);
    try {
      return await f.sessions.changeViews(
        cookie,
        key,
        lease,
        method,
        body,
        revision,
      );
    } finally {
      lease.release();
    }
  };
  assert.equal(await call(a.cookie, "GET"), null);
  const [first, second] = await Promise.all([
    call(a.cookie, "POST"),
    call(b.cookie, "POST"),
  ]);
  assert.deepEqual(first, second);
  assert.equal(first!.views.length, 1);
  const extra = {
    ...first!.views[0],
    id: randomUUID(),
    name: "交付",
    query: { ...first!.views[0].query, showCreator: true },
  };
  await call(b.cookie, "PATCH", {
    selected: { kind: "system", id: "archived" },
  });
  const saved = await call(a.cookie, "PUT", {
    expectedRevision: 1,
    views: [...first!.views, extra],
  });
  assert.deepEqual(saved!.selected, { kind: "system", id: "archived" });
  assert.equal(saved!.revision, 2);
  assert.equal(saved!.views[1].query.showCreator, true);
  await assert.rejects(
    call(b.cookie, "PUT", { expectedRevision: 1, views: [] }),
    { code: "VIEW_CONFLICT" },
  );
  assert.deepEqual(await call(b.cookie, "GET"), saved);
  assert.equal(await call(other.cookie, "GET"), null);
  assert.equal(await call(a.cookie, "GET", undefined, "repo-b"), null);
  const switched = await f.connect(a.cookie, "third");
  assert.deepEqual(await call(switched.cookie, "GET"), saved);
  await call(switched.cookie, "PATCH", {
    selected: { kind: "personal", id: "mine" },
  });
  await call(switched.cookie, "PUT", {
    expectedRevision: 2,
    views: [],
    selectAfterSave: undefined,
  });
  const empty = await call(b.cookie, "POST");
  assert.deepEqual(empty!.views, []);
  assert.deepEqual(empty!.selected, { kind: "system", id: "active" });
  const invalidLease = await f.sessions.lease(b.cookie, undefined);
  await f.sessions.remove(b.cookie);
  await assert.rejects(
    f.sessions.changeViews(b.cookie, "repo-a", invalidLease, "PUT", {
      expectedRevision: 3,
      views: first!.views,
    }),
  );
  invalidLease.release();
  assert.deepEqual((await call(switched.cookie, "GET"))!.views, []);
});

test("view endpoint authorizes repository, origin and browser revision without syncing Git", async (t) => {
  const fixture = await repositoryFixture();
  t.after(fixture.cleanup);
  const { f, c, key, service } = fixture;
  const browserRevision = String(
    (await f.sessions.get(c.cookie)).browserRevision,
  );
  const request = async (
    method: string,
    body?: unknown,
    origin = "https://folio.test",
    revision = browserRevision,
  ) =>
    repositoryResponse(
      new Request(
        `https://folio.test/api/repositories/${key}/change-views?connectionId=${c.connection.id}`,
        {
          method,
          headers: {
            cookie: `openfolio-account=${c.cookie}`,
            origin,
            "Content-Type": "application/json",
            "X-OpenFolio-Revision": revision,
          },
          ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        },
      ),
      key,
      ["change-views"],
      service,
    );
  const gitCalls = f.controls.gitCalls;
  assert.equal(await (await request("GET")).json(), null);
  assert.equal(
    (await request("POST", undefined, "https://other.test")).status,
    403,
  );
  assert.equal(
    (await request("POST", undefined, undefined, "999")).status,
    409,
  );
  const initial = await (await request("POST")).json();
  assert.equal(initial.views[0].name, "我的");
  assert.equal(
    (await request("PUT", { expectedRevision: 1, views: [] })).status,
    200,
  );
  assert.equal(
    (await request("PUT", { expectedRevision: 1, views: [] })).status,
    409,
  );
  assert.equal(
    (
      await request(
        "PATCH",
        { selected: { kind: "system", id: "archived" } },
        "https://other.test",
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await request("PUT", {
        expectedRevision: 2,
        views: [],
        bogus: "x".repeat(74000),
      })
    ).status,
    413,
  );
  assert.equal(f.controls.gitCalls, gitCalls);
  const denied = await repositoryResponse(
    new Request(
      `https://folio.test/api/repositories/${"0".repeat(64)}/change-views?connectionId=${c.connection.id}`,
      { headers: { cookie: `openfolio-account=${c.cookie}` } },
    ),
    "0".repeat(64),
    ["change-views"],
    service,
  );
  assert.ok(denied.status >= 400);
});

test("failed file save leaves prior definitions intact and rejects success", async (t) => {
  const f = await personalFixture();
  t.after(f.cleanup);
  const a = await f.connect();
  const lease = await f.sessions.lease(a.cookie, a.connection.id);
  t.after(() => lease.release());
  const first = await f.sessions.changeViews(a.cookie, "repo", lease, "POST");
  const writer = f.sessions as unknown as {
    save: (...args: unknown[]) => Promise<void>;
  };
  const original = writer.save;
  writer.save = async () => {
    throw new Error("simulated disk failure");
  };
  try {
    await assert.rejects(
      f.sessions.changeViews(a.cookie, "repo", lease, "PUT", {
        expectedRevision: 1,
        views: [],
      }),
      /simulated disk failure/,
    );
  } finally {
    writer.save = original;
  }
  assert.deepEqual(
    await f.sessions.changeViews(a.cookie, "repo", lease, "GET"),
    first,
  );
});
