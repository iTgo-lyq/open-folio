import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PersonalSessions } from "../src/server/personal-sessions.ts";
import { ProviderRegistry } from "../src/server/providers/registry.ts";
import { Discovery } from "../src/server/discovery.ts";
import { randomUUID } from "node:crypto";
import { GitHubProvider } from "../src/server/providers/github.ts";
import {
  SecretHandle,
  type ProviderContext,
  type RepositoryIdentity,
} from "../src/server/providers/types.ts";
import { personalError } from "../src/server/personal-http.ts";
import { api, ApiError } from "../src/components/api.ts";

const context = (): ProviderContext => ({
  identity: {
    providerId: "github",
    instanceId: "github.com",
    subjectId: randomUUID(),
    login: "demo",
    displayName: "Demo",
  },
  secret: new SecretHandle("mock-token"),
  signal: new AbortController().signal,
});
const repo: RepositoryIdentity = {
  providerId: "github",
  instanceId: "github.com",
  repositoryId: "12",
  fullName: "demo/work",
  displayName: "work",
  webUrl: "https://github.com/demo/work",
  cloneUrl: "https://github.com/demo/work.git",
  defaultBranch: "main",
};
const rate = { code: "RATE_LIMITED", status: 429 };

test("same GitHub subject shares actual cooldown across provider instances and tokens for all HTTP entry points", async () => {
  let now = Date.now(),
    calls = 0;
  const ctx = context();
  const first = new GitHubProvider(
    async () => {
      calls++;
      return new Response(null, {
        status: 429,
        headers: { "retry-after": "90" },
      });
    },
    { now: () => now },
  );
  await assert.rejects(first.listRepositories(ctx, null), {
    ...rate,
    retryAfter: "90",
  });
  const second = new GitHubProvider(
    async (input) => {
      calls++;
      return Response.json(
        new URL(String(input)).pathname === "/user"
          ? { id: 7, login: "demo" }
          : [],
      );
    },
    { now: () => now },
  );
  const otherToken = { ...ctx, secret: new SecretHandle("second-token") };
  const blocked = [
    () => second.listRepositories(otherToken, null),
    () => second.resolveRepository(otherToken, repo),
    () => second.assertRead(otherToken, repo, "develop"),
    () => second.probeWorkflow(otherToken, repo, "develop"),
    () => second.getPullRequest(otherToken, repo, 1),
    () =>
      second.listPullRequests(
        otherToken,
        repo,
        { base: "develop" },
        null,
        '"etag"',
      ),
    () =>
      second.authenticate(
        otherToken.secret,
        otherToken.signal,
        otherToken.identity,
      ),
  ];
  now += 1500;
  for (const operation of blocked)
    await assert.rejects(operation(), { ...rate, retryAfter: "89" });
  assert.equal(calls, 1);
  await second.listRepositories(context(), null);
  assert.equal(calls, 2);
  // An unknown first-time binding necessarily performs its single identity request.
  await second.authenticate(otherToken.secret, otherToken.signal);
  assert.equal(calls, 3);
  now += 88_500;
  assert.deepEqual(await second.listRepositories(otherToken, null), {
    items: [],
    nextCursor: null,
  });
  assert.equal(calls, 4);
});

test("rate classification uses bounded error text and server deadlines, without proactive low-quota rules", async () => {
  const now = Date.UTC(2026, 9, 24);
  for (const [response, wait] of [
    [
      Response.json(
        { message: "You have exceeded a secondary rate limit." },
        { status: 403, headers: { "x-ratelimit-remaining": "4999" } },
      ),
      "60",
    ],
    [
      Response.json(
        { message: "You have triggered an abuse detection mechanism." },
        { status: 403 },
      ),
      "60",
    ],
    [
      new Response(null, {
        status: 403,
        headers: {
          "x-ratelimit-remaining": "0",
          "x-ratelimit-reset": String(now / 1000 + 300),
          "retry-after": "10",
        },
      }),
      "300",
    ],
    [
      new Response(null, {
        status: 429,
        headers: { "retry-after": new Date(now + 120_000).toUTCString() },
      }),
      "120",
    ],
    [
      new Response(null, {
        status: 429,
        headers: {
          "retry-after": "600",
          "x-ratelimit-remaining": "0",
          "x-ratelimit-reset": String(now / 1000 + 300),
        },
      }),
      "600",
    ],
    [
      new Response(null, { status: 429, headers: { "retry-after": "1.5" } }),
      "60",
    ],
    [
      new Response("x".repeat(128 * 1024), {
        status: 429,
        headers: { "retry-after": "invalid" },
      }),
      "60",
    ],
  ] as const) {
    let calls = 0;
    const p = new GitHubProvider(
      async () => {
        calls++;
        return response;
      },
      { now: () => now, deadlines: new Map() },
    );
    const ctx = context();
    await assert.rejects(p.listRepositories(ctx, null), {
      ...rate,
      retryAfter: wait,
    });
    await assert.rejects(p.listRepositories(ctx, null), rate);
    assert.equal(calls, 1);
  }
  for (const remaining of ["1", "0"]) {
    let calls = 0;
    const p = new GitHubProvider(
      async () => {
        calls++;
        return Response.json([], {
          headers: {
            "x-ratelimit-remaining": remaining,
            "x-ratelimit-reset": String(now / 1000 + 300),
          },
        });
      },
      { deadlines: new Map() },
    );
    const ctx = context();
    await p.listRepositories(ctx, null);
    await p.listRepositories(ctx, null);
    assert.equal(calls, 2);
  }
  for (const [status, code] of [
    [401, "TOKEN_INVALID"],
    [403, "DISCOVERY_DENIED"],
    [503, "PROVIDER_UNAVAILABLE"],
  ] as const) {
    let calls = 0;
    const p = new GitHubProvider(async () => {
      calls++;
      return Response.json(
        { message: "Resource not accessible by personal access token" },
        { status },
      );
    });
    const ctx = context();
    await assert.rejects(p.listRepositories(ctx, null), { code });
    await assert.rejects(p.listRepositories(ctx, null), { code });
    assert.equal(calls, 2);
  }
});

test("a later in-flight rejection cannot shorten a longer shared cooldown; HTTP and client preserve wait information", async (t) => {
  const ctx = context();
  let calls = 0;
  const pending: ((response: Response) => void)[] = [];
  const p = new GitHubProvider(
    async () => {
      calls++;
      return new Promise<Response>((resolve) => pending.push(resolve));
    },
    { now: () => 1000, deadlines: new Map() },
  );
  const a = p.listRepositories(ctx, null),
    b = p.listRepositories(ctx, null);
  const rejectedA = assert.rejects(a, { ...rate, retryAfter: "300" });
  const rejectedB = assert.rejects(b, { ...rate, retryAfter: "300" });
  pending[0](
    new Response(null, { status: 429, headers: { "retry-after": "300" } }),
  );
  await rejectedA;
  pending[1](
    new Response(null, { status: 429, headers: { "retry-after": "5" } }),
  );
  await rejectedB;
  let error: unknown;
  try {
    await p.listRepositories(ctx, null);
  } catch (e) {
    error = e;
  }
  assert.equal(calls, 2);
  const response = personalError(error);
  assert.equal(response.status, 429);
  assert.equal(response.headers.get("retry-after"), "300");
  t.mock.method(globalThis, "fetch", async () => response.clone());
  await assert.rejects(
    api("/api/repositories/repo/refresh", { method: "POST" }),
    (e: unknown) => {
      assert(e instanceof ApiError);
      assert.equal(e.code, "RATE_LIMITED");
      assert.equal(e.retryAfter, "300");
      assert.match(e.message, /300 秒/);
      return true;
    },
  );
});

test("rebinding a known Token, switching and discovery reuse its existing identity during cooldown", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "folio-cooldown-binding-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const paths: string[] = [];
  const provider = new GitHubProvider(
    async (input) => {
      const path = new URL(String(input)).pathname;
      paths.push(path);
      if (path === "/user") return Response.json({ id: 7, login: "demo" });
      return new Response(null, {
        status: 429,
        headers: { "retry-after": "90" },
      });
    },
    { deadlines: new Map() },
  );
  const sessions = new PersonalSessions(
    join(root, "sessions"),
    new ProviderRegistry([provider]),
    join(root, "key"),
  );
  const signal = new AbortController().signal;
  const account = await sessions.register(
    "",
    "reader",
    "test-password",
    signal,
  );
  const bound = await sessions.bind(
    account.cookie,
    "github",
    "mock-token",
    undefined,
    signal,
  );
  const lease = await sessions.lease(account.cookie, bound.connection.id);
  try {
    await assert.rejects(provider.listRepositories(lease.context, null), rate);
  } finally {
    lease.release();
  }
  await assert.rejects(
    sessions.bind(account.cookie, "github", "mock-token", undefined, signal),
    rate,
  );
  await assert.rejects(
    sessions.switchConnection(account.cookie, bound.connection.id, signal),
    rate,
  );
  const discovery = new Discovery(
    join(root, "discovery"),
    sessions,
    async () => new Map(),
  );
  await assert.rejects(
    discovery.start(account.cookie, bound.connection.id),
    rate,
  );
  assert.deepEqual(paths, ["/user", "/user/repos"]);
  const after = await sessions.get(account.cookie);
  assert.equal(after.browserRevision, bound.session.browserRevision);
  assert.equal(after.connected, true);
});
