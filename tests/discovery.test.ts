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
import { sessionResponse } from "../src/server/connection-api.ts";
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
      cookie: `openfolio-session=${cookie}`,
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
      listing.items.map((r) => [r.repository.displayName, r.state]),
      [
        ["content", "ready"],
        ["empty-content", "ready"],
        ["invalid", "attention"],
        ["source", "attention"],
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
    const response = await sessionResponse(
      req("POST", "", {
        providerId: "sample",
        username: "reader",
        token: "first",
      }),
      f.sessions,
      f.discovery,
    );
    assert.equal(response.status, 201);
    const body = await response.json(),
      cookie = response.headers.get("set-cookie")!.split(";")[0].split("=")[1],
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
