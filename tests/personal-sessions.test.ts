import test from "node:test";
import assert from "node:assert/strict";
import { readFile, writeFile, stat, unlink } from "node:fs/promises";
import { join } from "node:path";
import {
  PersonalSessions,
  sessionIdleTtl,
  sessionAbsoluteTtl,
  parseWorkspaceState,
} from "../src/server/personal-sessions.ts";
import { personalFixture } from "./personal-fixture.ts";
import {
  sessionResponse,
  registrationResponse,
  connectionsResponse,
} from "../src/server/connection-api.ts";
const signal = () => new AbortController().signal;
const req = (
  method: string,
  cookie = "",
  body?: unknown,
  revision?: number,
  headers: Record<string, string> = {},
) =>
  new Request("https://folio.test/api/session", {
    method,
    headers: {
      origin: "https://folio.test",
      "content-type": "application/json",
      ...(cookie ? { cookie: `openfolio-account=${cookie}` } : {}),
      ...(revision === undefined
        ? {}
        : { "X-OpenFolio-Revision": String(revision) }),
      ...headers,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

test("self-chosen accounts normalize names, preserve passwords, and log in without Token", async (t) => {
  const f = await personalFixture();
  t.after(f.cleanup);
  const a = await f.sessions.register(
    "",
    "  Ｒeader  ",
    " password ",
    signal(),
  );
  assert.equal(a.session.authenticated, true);
  assert.equal(a.session.connected, false);
  assert.equal(a.session.account?.username, "Ｒeader");
  await assert.rejects(
    f.sessions.register("", "reader", "different", signal()),
    { code: "ACCOUNT_EXISTS" },
  );
  for (const password of ["password", "incorrect"])
    await assert.rejects(f.sessions.login("", "reader", password, signal()), {
      code: "INVALID_CREDENTIALS",
    });
  const b = await f.sessions.login("", "READER", " password ", signal());
  assert.equal(b.session.account?.id, a.session.account?.id);
  assert.notEqual(a.cookie, b.cookie);
  for (const [username, password] of [
    ["\u0000user", "12345678"],
    ["", "12345678"],
    ["valid", "short"],
  ])
    await assert.rejects(
      f.sessions.register("", username, password, signal()),
      { status: 400 },
    );
});
test("concurrent registration commits one unique account, and only salted hashes are persisted", async (t) => {
  const f = await personalFixture();
  t.after(f.cleanup);
  const results = await Promise.allSettled([
    f.sessions.register("", "same", "secret-password", signal()),
    f.sessions.register("", "ＳＡＭＥ", "secret-password", signal()),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  const raw = await readFile(join(f.sessions.root, "state.json"), "utf8"),
    state = JSON.parse(raw);
  assert.equal(state.accounts.length, 1);
  assert.equal(state.sessions.length, 1);
  assert.ok(!raw.includes("secret-password"));
  for (const path of [
    join(f.sessions.root, "state.json"),
    f.sessions.keyPath,
    f.sessions.identityKeyPath,
  ])
    assert.equal((await stat(path)).mode & 0o777, 0o600);
  const a = results.find((r) => r.status === "fulfilled")!;
  if (a.status === "fulfilled") assert.ok(!raw.includes(a.value.cookie));
});
test("wrong and missing credentials share errors and bounded failure throttling", async (t) => {
  const f = await personalFixture();
  t.after(f.cleanup);
  const account = await f.sessions.register(
    "",
    "limited",
    "good-password",
    signal(),
  );
  for (let n = 0; n < 5; n++)
    await assert.rejects(
      f.sessions.login("", "limited", "bad-password", signal()),
      { code: "INVALID_CREDENTIALS", status: 401 },
    );
  const r = await sessionResponse(
    req("POST", "", { username: "LIMITED", password: "good-password" }),
    f.sessions,
  );
  assert.equal(r.status, 429);
  assert.ok(Number(r.headers.get("retry-after")) > 0);
  await assert.rejects(
    f.sessions.login("", "missing", "bad-password", signal()),
    { code: "INVALID_CREDENTIALS", status: 401 },
  );
  assert.equal((await f.sessions.get(account.cookie)).authenticated, true);
});
test("new Cookie and strict password protocol reject old requests, same-origin is required", async (t) => {
  const f = await personalFixture();
  t.after(f.cleanup);
  const body = { username: "reader", password: "test-password" };
  const registered = await registrationResponse(
    req("POST", "", body),
    f.sessions,
  );
  assert.equal(registered.status, 201);
  const header = registered.headers.get("set-cookie")!;
  assert.match(header, /^openfolio-account=/);
  assert.match(header, /HttpOnly.*SameSite=Lax.*Secure/);
  const cookie = header.split(";")[0].split("=")[1];
  assert.equal(
    (
      await sessionResponse(
        req("POST", "", { token: "first", providerId: "sample" }),
        f.sessions,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await sessionResponse(
        req("GET", "", undefined, undefined, {
          cookie: `openfolio-session=${cookie}`,
        }),
        f.sessions,
      ).then((r) => r.json())
    ).authenticated,
    false,
  );
  assert.equal(
    (
      await registrationResponse(
        req("POST", "", body, undefined, { origin: "https://other.test" }),
        f.sessions,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await connectionsResponse(
        req("POST", cookie, { providerId: "sample", token: "first" }),
        undefined,
        f.sessions,
      )
    ).status,
    409,
  );
  const bound = await connectionsResponse(
    req("POST", cookie, { providerId: "sample", token: "first" }, 1),
    undefined,
    f.sessions,
  );
  assert.equal(bound.status, 201);
  assert.equal(bound.headers.get("set-cookie"), null);
  const summary = await sessionResponse(req("GET", cookie), f.sessions);
  assert.match(summary.headers.get("cache-control")!, /no-store/);
  const text = await summary.text();
  for (const secret of [
    "ciphertext",
    "passwordHash",
    "cookieHash",
    "credentialFingerprint",
    '"identities"',
  ])
    assert.ok(!text.includes(secret));
});
test("binding and workspace access survives restart with encrypted Token and isolated accounts", async (t) => {
  const f = await personalFixture();
  t.after(f.cleanup);
  const a = await f.connect();
  const b = await f.sessions.register(
    "",
    "different-account",
    "test-password",
    signal(),
  );
  const other = await f.sessions.bind(
    b.cookie,
    "sample",
    "first",
    undefined,
    signal(),
  );
  assert.notEqual(a.connection.id, other.connection.id);
  await assert.rejects(f.sessions.lease(b.cookie, a.connection.id), {
    code: "SESSION_REQUIRED",
  });
  const raw = await readFile(join(f.sessions.root, "state.json"), "utf8"),
    state = JSON.parse(raw);
  assert.ok(!raw.includes('"first"'));
  assert.notEqual(
    state.workspaces[0].credentialFingerprint,
    state.workspaces[1].credentialFingerprint,
  );
  const restarted = new PersonalSessions(
    f.sessions.root,
    f.registry,
    f.sessions.keyPath,
  );
  const lease = await restarted.lease(a.cookie, a.connection.id);
  assert.equal(
    lease.context.secret.use((v) => v),
    "first",
  );
  await lease.assertCurrent();
  lease.release();
  await f.discovery.start(a.cookie, a.connection.id);
  await f.discovery.wait(a.cookie, a.connection.id);
  assert.ok((await f.discovery.list(a.cookie, a.connection.id)).items.length);
});
test("daily idle renewal, absolute expiry, and account replacement never revive old Cookie", async (t) => {
  const f = await personalFixture();
  t.after(f.cleanup);
  let now = Date.now();
  const store = new PersonalSessions(
    f.sessions.root,
    f.registry,
    f.sessions.keyPath,
    () => now,
  );
  const a = await store.register("", "reader", "test-password", signal());
  now += 25 * 60 * 60 * 1000;
  const renewed = await store.get(a.cookie);
  assert.ok(renewed.renewed);
  assert.equal(renewed.expiresAt, now + sessionIdleTtl);
  const b = await store.login(a.cookie, "reader", "test-password", signal());
  assert.equal((await store.get(a.cookie)).authenticated, false);
  now += sessionAbsoluteTtl + 1;
  assert.equal((await store.get(b.cookie)).authenticated, false);
  const again = await store.login("", "reader", "test-password", signal());
  assert.equal(again.session.authenticated, true);
});
test("corrupt state, old schemas, and missing keys fail closed without replacement", async (t) => {
  const f = await personalFixture();
  t.after(f.cleanup);
  await f.connect();
  const path = join(f.sessions.root, "state.json"),
    original = await readFile(path);
  for (const value of [
    { schemaVersion: 2, workspaces: [], sessions: [] },
    { schemaVersion: 3, workspaces: [], sessions: [], browsers: [] },
  ])
    assert.throws(() => parseWorkspaceState(value));
  await writeFile(path, "broken");
  await assert.rejects(f.sessions.get(""), { code: "SESSION_DATA_INVALID" });
  assert.equal(await readFile(path, "utf8"), "broken");
  await writeFile(path, original);
  await unlink(f.sessions.keyPath);
  await assert.rejects(f.sessions.get(""), {
    code: "CREDENTIAL_KEY_UNAVAILABLE",
  });
  assert.deepEqual(await readFile(path), original);
});

test("account writes require the browser origin and enforce bounded strict bodies", async (t) => {
  const f = await personalFixture();
  t.after(f.cleanup);
  const body = { username: "reader", password: "test-password" };
  const request = (
    url: string,
    headers: Record<string, string>,
    input: unknown = body,
  ) =>
    new Request(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(input),
    });
  for (const headers of [
    { origin: "https://foreign.test" },
    { origin: "https://folio.test", "sec-fetch-site": "cross-site" },
    { "x-forwarded-host": "folio.test", origin: "https://folio.test" },
  ]) {
    const r = await registrationResponse(
      request("http://localhost:11118/api/accounts/register", headers),
      f.sessions,
    );
    assert.equal(r.status, 403);
  }
  assert.equal(
    (
      await registrationResponse(
        request("http://remote.test/api/accounts/register", {
          origin: "http://remote.test",
        }),
        f.sessions,
      )
    ).status,
    400,
  );
  const proxy = await registrationResponse(
    request("http://localhost:11118/api/accounts/register", {
      host: "folio.test",
      "x-forwarded-proto": "https",
      origin: "https://folio.test",
    }),
    f.sessions,
  );
  assert.equal(proxy.status, 201);
  assert.match(proxy.headers.get("set-cookie")!, /Secure/);
  assert.equal(
    (
      await registrationResponse(
        request(
          "https://folio.test/api/accounts/register",
          { origin: "https://folio.test" },
          { ...body, token: "old" },
        ),
        f.sessions,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await registrationResponse(
        request(
          "https://folio.test/api/accounts/register",
          { origin: "https://folio.test" },
          { ...body, password: "x".repeat(17000) },
        ),
        f.sessions,
      )
    ).status,
    413,
  );
});
test("cancelled registration cannot create an account or device", async (t) => {
  const f = await personalFixture();
  t.after(f.cleanup);
  await assert.rejects(
    f.sessions.register("", "cancelled", "test-password", AbortSignal.abort()),
  );
  assert.equal((await f.sessions.get("")).authenticated, false);
  const account = await f.sessions.register(
    "",
    "cancelled",
    "test-password",
    signal(),
  );
  assert.ok(account.session.authenticated);
});

test("a concurrent binding rename cannot strand an already committed password login", async (t) => {
  const f = await personalFixture();
  t.after(f.cleanup);
  const owner = await f.connect();
  const get = f.sessions.get.bind(f.sessions);
  let renamed = false;
  f.sessions.get = async (cookie) => {
    if (!renamed && cookie !== owner.cookie) {
      renamed = true;
      await f.sessions.renameConnection(
        owner.cookie,
        owner.connection.id,
        "updated elsewhere",
      );
    }
    return get(cookie);
  };
  const response = await sessionResponse(
    req("POST", "", {
      username: owner.session.account!.username,
      password: "test-password",
    }),
    f.sessions,
  );
  assert.equal(response.status, 201);
  assert.ok(response.headers.get("set-cookie"));
  const { session } = await response.json();
  assert.equal(session.connections[0].label, "updated elsewhere");
  assert.equal(session.browserRevision, 2);
  assert.ok(session.authenticated);
});
