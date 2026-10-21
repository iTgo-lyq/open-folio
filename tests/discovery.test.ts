import test from "node:test";
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { personalFixture } from "./personal-fixture.ts";
import { Discovery } from "../src/server/discovery.ts";
import {
  repositoryPermissions,
  PERMISSION_CHECK_MS,
} from "../src/server/repository-permissions.ts";
import { repositoryKey } from "../src/server/providers/types.ts";
import { connectionsResponse } from "../src/server/connection-api.ts";
import {
  discoveryResponse,
  repositoryListResponse,
} from "../src/server/discovery-api.ts";
const req = (
  method: string,
  cookie: string,
  body?: unknown,
  path = "/api/repositories",
) =>
  new Request(`https://folio.test${path}`, {
    method,
    headers: {
      origin: "https://folio.test",
      cookie: `openfolio-account=${cookie}`,
      "content-type": "application/json",
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
test("discovery distinguishes six samples, paginates, and publishes only authorized integrated repositories", async () => {
  const f = await personalFixture();
  try {
    const c = await f.connect();
    await f.discovery.start(c.cookie, c.connection.id);
    await f.discovery.wait(c.cookie, c.connection.id);
    const status = await f.discovery.status(c.cookie, c.connection.id);
    assert.equal(status?.checked, 6);
    assert.equal(status?.found, 4);
    assert.equal(status?.failed, 1);
    assert.equal(status?.state, "partial");
    assert.deepEqual(f.controls.pages, [null, "page-2"]);
    const listing = await f.discovery.list(c.cookie, c.connection.id);
    assert.deepEqual(
      listing.items
        .map((r) => [r.repository.displayName, r.state])
        .sort(([a], [b]) => a.localeCompare(b)),
      [
        ["content", "ready"],
        ["empty-content", "ready"],
        ["invalid", "attention"],
        ["source", "ready"],
      ],
    );
    assert.ok(!JSON.stringify(status).includes("team/content"));
    const missing = await f.discovery.check(
      c.cookie,
      c.connection.id,
      "https://sample.test/team/missing",
    );
    assert.equal(missing.state, "not-integrated");
    await assert.rejects(
      () =>
        f.discovery.check(
          c.cookie,
          c.connection.id,
          "https://else.test/team/content",
        ),
      { code: "INVALID_REPOSITORY_URL" },
    );
  } finally {
    await f.cleanup();
  }
});
test("rate limiting retains continuation and completed results for retry", async () => {
  const f = await personalFixture();
  try {
    const c = await f.connect();
    f.controls.rateLimit = true;
    await f.discovery.start(c.cookie, c.connection.id);
    await f.discovery.wait(c.cookie, c.connection.id);
    let status = await f.discovery.status(c.cookie, c.connection.id);
    assert.equal(status?.checked, 3);
    assert.equal(status?.state, "partial");
    assert.equal(status?.hasMore, true);
    assert.equal(status?.retryAfter, "1");
    f.controls.rateLimit = false;
    const before = [...f.controls.pages];
    await assert.rejects(
      () => f.discovery.start(c.cookie, c.connection.id, true),
      { code: "RATE_LIMITED", status: 429 },
    );
    assert.deepEqual(f.controls.pages, before);
    await new Promise((resolve) => setTimeout(resolve, 1100));
    await f.discovery.start(c.cookie, c.connection.id, true);
    await f.discovery.wait(c.cookie, c.connection.id);
    status = await f.discovery.status(c.cookie, c.connection.id);
    assert.equal(status?.checked, 6);
    assert.equal(status?.hasMore, false);
    assert.deepEqual(f.controls.pages, [null, "page-2", "page-2"]);
  } finally {
    await f.cleanup();
  }
});
test("cached discoveries cannot authorize listings after revocation or from another session", async () => {
  const f = await personalFixture();
  try {
    const c = await f.connect(),
      other = await f.connect("", "second");
    await f.discovery.start(c.cookie, c.connection.id);
    await f.discovery.wait(c.cookie, c.connection.id);
    f.controls.deny.add("1");
    const list = await f.discovery.list(c.cookie, c.connection.id);
    assert.ok(
      !list.items.some((r) => r.key === repositoryKey(f.repositories[0])),
    );
    assert.equal(list.unavailable, 1);
    await assert.rejects(
      () => f.discovery.list(other.cookie, c.connection.id),
      { code: "SESSION_REQUIRED" },
    );
    f.controls.identityInvalid = true;
    await assert.rejects(() => f.discovery.list(c.cookie, c.connection.id), {
      code: "TOKEN_INVALID",
    });
  } finally {
    await f.cleanup();
  }
});
test("restart records interruption and duplicate start requests share one job", async () => {
  const f = await personalFixture();
  try {
    const c = await f.connect();
    f.controls.delay = 15;
    await Promise.all([
      f.discovery.start(c.cookie, c.connection.id),
      f.discovery.start(c.cookie, c.connection.id),
    ]);
    await f.discovery.wait(c.cookie, c.connection.id);
    assert.deepEqual(f.controls.pages, [null, "page-2"]);
    const lease = await f.sessions.lease(c.cookie, c.connection.id),
      path = join(f.root, "discovery", lease.workspaceId, "state.json");
    lease.release();
    const job = JSON.parse(await readFile(path, "utf8"));
    job.state = "running";
    await writeFile(path, JSON.stringify(job));
    const restarted = new Discovery(
      join(f.root, "discovery"),
      f.sessions,
      f.git,
    );
    assert.equal(
      (await restarted.status(c.cookie, c.connection.id))?.state,
      "interrupted",
    );
  } finally {
    await f.cleanup();
  }
});
test("HTTP connection success starts discovery and manual checks stay owned by the connection", async () => {
  const f = await personalFixture();
  try {
    const auth = await f.sessions.register(
      "",
      "discovery-reader",
      "test-password",
      new AbortController().signal,
    );
    const request = req(
      "POST",
      auth.cookie,
      { providerId: "sample", token: "first" },
      "/api/connections",
    );
    request.headers.set("X-OpenFolio-Revision", "1");
    const response = await connectionsResponse(
      request,
      undefined,
      f.sessions,
      f.discovery,
    );
    assert.equal(response.status, 201);
    const body = await response.json(),
      cookie = auth.cookie,
      id = body.connection.id;
    await f.discovery.wait(cookie, id);
    const state = await discoveryResponse(
      req("GET", cookie),
      id,
      "discovery",
      f.discovery,
    );
    assert.equal((await state.json()).discovery.checked, 6);
    const list = await repositoryListResponse(
      req("GET", cookie, undefined, `/api/repositories?connectionId=${id}`),
      f.discovery,
    );
    assert.equal((await list.json()).items.length, 4);
    const check = await discoveryResponse(
      req("POST", cookie, { url: "https://sample.test/team/content" }),
      id,
      "check",
      f.discovery,
    );
    assert.equal((await check.json()).state, "ready");
  } finally {
    await f.cleanup();
  }
});

test("discovery bounds concurrent probes and logged-out devices cannot read its job", async () => {
  const f = await personalFixture();
  try {
    f.controls.delay = 25;
    f.repositories.splice(
      0,
      f.repositories.length,
      ...Array.from({ length: 12 }, (_, i) => ({
        ...f.repositories[0],
        repositoryId: String(i + 20),
        fullName: `team/repo-${i}`,
        displayName: `repo-${i}`,
      })),
    );
    const connections = await Promise.all([
      f.connect(),
      f.connect("", "second"),
      f.connect("", "third"),
    ]);
    await Promise.all(
      connections.map((c) => f.discovery.start(c.cookie, c.connection.id)),
    );
    await Promise.all(
      connections.map((c) => f.discovery.wait(c.cookie, c.connection.id)),
    );
    assert.ok(f.controls.maxActive <= 8);
    const c = connections[0];
    f.controls.delay = 100;
    await f.discovery.start(c.cookie, c.connection.id);
    const waiting = f.discovery.wait(c.cookie, c.connection.id);
    await f.sessions.remove(c.cookie, c.connection.id);
    await waiting;
    await assert.rejects(() => f.discovery.status(c.cookie, c.connection.id), {
      code: "SESSION_REQUIRED",
    });
  } finally {
    await f.cleanup();
  }
});

test("directory checks run once per entry with bounded concurrency and retain the original order", async () => {
  const f = await personalFixture();
  try {
    const c = await f.connect();
    for (let i = 7; i <= 16; i++)
      f.repositories.push({
        ...f.repositories[0],
        repositoryId: String(i),
        fullName: `team/content-${i}`,
      });
    await f.discovery.start(c.cookie, c.connection.id);
    await f.discovery.wait(c.cookie, c.connection.id);
    const before = await f.discovery.list(c.cookie, c.connection.id);
    const original = f.provider.assertRead;
    const checked: string[] = [];
    let active = 0,
      peak = 0;
    f.provider.assertRead = async (ctx, repo) => {
      checked.push(repo.repositoryId);
      active++;
      peak = Math.max(peak, active);
      try {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return await original(ctx, repo);
      } finally {
        active--;
      }
    };
    const gitCalls = f.controls.gitCalls;
    let permissionTime = Date.now();
    repositoryPermissions(f.sessions).now = () => permissionTime;
    await f.discovery.list(c.cookie, c.connection.id);
    assert.equal(checked.length, 0);
    permissionTime += PERMISSION_CHECK_MS;
    const listing = await f.discovery.list(c.cookie, c.connection.id);
    assert.deepEqual(listing.items, before.items);
    assert.equal(new Set(checked).size, listing.items.length);
    assert.equal(checked.length, listing.items.length);
    assert.ok(peak > 1 && peak <= 8, `peak concurrency: ${peak}`);
    assert.equal(f.controls.gitCalls, gitCalls);
    f.controls.deny.add("1");
    permissionTime += PERMISSION_CHECK_MS;
    const revoked = await f.discovery.list(c.cookie, c.connection.id);
    assert.ok(
      !revoked.items.some((item) => item.repository.repositoryId === "1"),
    );
    assert.equal(revoked.unavailable, 1);
  } finally {
    await f.cleanup();
  }
});

test("same-token discovery is shared across devices and survives one logout; logout-all cancels it", async () => {
  const f = await personalFixture();
  try {
    const a = await f.connect(),
      b = await f.connect();
    f.controls.delay = 30;
    await Promise.all([
      f.discovery.start(a.cookie, a.connection.id),
      f.discovery.start(b.cookie, b.connection.id),
    ]);
    await f.sessions.remove(a.cookie);
    await f.discovery.wait(b.cookie, b.connection.id);
    assert.deepEqual(f.controls.pages, [null, "page-2"]);
    assert.equal(
      (await f.discovery.status(b.cookie, b.connection.id))?.checked,
      6,
    );
    const before = [...f.controls.pages];
    await f.discovery.ensure(b.cookie, b.connection.id);
    assert.deepEqual(f.controls.pages, before);
    const c = await f.connect();
    assert.equal(c.connection.id, b.connection.id);
    await f.discovery.start(b.cookie, b.connection.id);
    const wait = f.discovery.wait(c.cookie, c.connection.id);
    await f.sessions.remove(b.cookie, undefined, true);
    await wait;
    const restored = await f.connect();
    assert.equal(
      (await f.discovery.status(restored.cookie, restored.connection.id))
        ?.state,
      "interrupted",
    );
    await f.discovery.start(restored.cookie, restored.connection.id, true);
    await f.discovery.wait(restored.cookie, restored.connection.id);
    assert.equal(
      (await f.discovery.status(restored.cookie, restored.connection.id))
        ?.checked,
      6,
    );
  } finally {
    await f.cleanup();
  }
});

test("custom branch selections survive rediscovery, restart, rename and concurrent checks without default or protected ref probes", async (t) => {
  const f = await personalFixture();
  t.after(f.cleanup);
  const c = await f.connect();
  const calls: string[][] = [];
  const d = new Discovery(
    join(f.root, "selected-discovery"),
    f.sessions,
    async (p, ctx, repo, branches) => {
      calls.push(branches);
      return f.git(p, ctx, repo, branches);
    },
  );
  f.repositories[0].defaultBranch = null;
  const results = await Promise.all([
    d.check(
      c.cookie,
      c.connection.id,
      f.repositories[0].webUrl,
      "integration/team-a",
    ),
    d.check(c.cookie, c.connection.id, f.repositories[4].webUrl, "pre-release"),
  ]);
  assert(results.every((r) => r.state === "ready"));
  assert.deepEqual(calls, [["integration/team-a"], ["pre-release"]]);
  f.repositories[0].fullName = "team/renamed";
  f.repositories[0].webUrl = "https://sample.test/team/renamed";
  await d.start(c.cookie, c.connection.id);
  await d.wait(c.cookie, c.connection.id);
  const restored = new Discovery(
    join(f.root, "selected-discovery"),
    f.sessions,
    f.git,
  );
  const otherDevice = await f.connect();
  const listing = await restored.list(
    otherDevice.cookie,
    otherDevice.connection.id,
  );
  assert.equal(
    listing.items.find((i) => i.repository.repositoryId === "1")
      ?.integrationBranch,
    "integration/team-a",
  );
  assert.equal(
    listing.items.find((i) => i.repository.repositoryId === "5")
      ?.integrationBranch,
    "pre-release",
  );
  const otherToken = await f.connect("", "second");
  assert.equal(
    (
      await restored.check(
        otherToken.cookie,
        otherToken.connection.id,
        f.repositories[0].webUrl,
      )
    ).integrationBranch,
    "develop",
  );
  await assert.rejects(
    restored.check(
      c.cookie,
      c.connection.id,
      f.repositories[0].webUrl,
      "../bad",
    ),
    { code: "INVALID_PARAMETER" },
  );
});

test("workflow version and selected branch must match without redirecting to the declared name", async (t) => {
  const f = await personalFixture();
  t.after(f.cleanup);
  const c = await f.connect();
  const original = f.provider.probeWorkflow;
  f.provider.probeWorkflow = async (ctx, repo) =>
    original(ctx, repo, "elsewhere");
  const mismatch = await f.discovery.check(
    c.cookie,
    c.connection.id,
    f.repositories[0].webUrl,
    "integration",
  );
  assert.equal(mismatch.state, "attention");
  assert.match(mismatch.message!, /不一致/);
  f.provider.probeWorkflow = async () => ({
    kind: "file",
    commit: "a".repeat(40),
    bytes: Buffer.from(
      JSON.stringify({ schemaVersion: 1, releaseBranch: "main" }),
    ),
  });
  assert.equal(
    (
      await f.discovery.check(
        c.cookie,
        c.connection.id,
        f.repositories[0].webUrl,
      )
    ).state,
    "attention",
  );
});
