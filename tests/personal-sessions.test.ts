import test from "node:test";
import assert from "node:assert/strict";
import { readFile, writeFile, stat, unlink } from "node:fs/promises";
import { join } from "node:path";
import {
  PersonalSessions,
  sessionIdleTtl,
  sessionAbsoluteTtl,
} from "../src/server/personal-sessions.ts";
import { personalFixture } from "./personal-fixture.ts";
import {
  sessionResponse,
  logoutAllResponse,
} from "../src/server/connection-api.ts";
import { ProviderError } from "../src/server/providers/types.ts";
const signal = () => new AbortController().signal;
const req = (
  method: string,
  cookie = "",
  body?: unknown,
  headers: Record<string, string> = {},
) =>
  new Request("https://folio.test/api/session", {
    method,
    headers: {
      origin: "https://folio.test",
      "content-type": "application/json",
      ...(cookie ? { cookie: `openfolio-session=${cookie}` } : {}),
      ...headers,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
const input = (token = "first") => ({
  providerId: "sample",
  username: "reader",
  token,
});
const cookieOf = (r: Response) =>
  r.headers.get("set-cookie")!.split(";")[0].split("=")[1];

test("same token converges across concurrent devices and survives restart without revealing its index", async () => {
  const f = await personalFixture();
  try {
    const secondStore = new PersonalSessions(
      f.sessions.root,
      f.registry,
      f.sessions.keyPath,
    );
    const [a, b] = await Promise.all([
      f.connect(),
      secondStore.login("", "sample", "first", "reader", signal()),
    ]);
    assert.equal(a.connection.id, b.connection.id);
    assert.notEqual(a.cookie, b.cookie);
    assert.equal((await f.sessions.get(a.cookie)).connected, true);
    const path = join(f.sessions.root, "state.json"),
      raw = await readFile(path, "utf8"),
      state = JSON.parse(raw);
    assert.equal(state.workspaces.length, 1);
    assert.equal(state.sessions.length, 2);
    assert.deepEqual(Object.keys(state).sort(), [
      "schemaVersion",
      "sessions",
      "workspaces",
    ]);
    assert.ok(!raw.includes(a.cookie));
    assert.ok(!raw.includes('"first"'));
    assert.ok(!JSON.stringify(a.session).includes("credentialFingerprint"));
    for (const file of [path, f.sessions.keyPath, f.sessions.identityKeyPath])
      assert.equal((await stat(file)).mode & 0o777, 0o600);
    const restarted = new PersonalSessions(
      f.sessions.root,
      f.registry,
      f.sessions.keyPath,
    );
    const lease = await restarted.lease(b.cookie, a.connection.id);
    assert.equal(
      lease.context.secret.use((v) => v),
      "first",
    );
    await lease.assertCurrent();
    lease.release();
  } finally {
    await f.cleanup();
  }
});
test("different tokens for the same identity stay separate; rename and adapter Git username preserve token identity", async () => {
  const f = await personalFixture();
  try {
    const a = await f.connect(),
      b = await f.connect("", "third");
    assert.equal(
      a.connection.identity.subjectId,
      b.connection.identity.subjectId,
    );
    assert.notEqual(a.connection.id, b.connection.id);
    await assert.rejects(() => f.sessions.lease(b.cookie, a.connection.id), {
      code: "SESSION_REQUIRED",
    });
    const authenticate = f.provider.authenticate;
    f.provider.authenticate = async (secret, sig) => ({
      ...(await authenticate(secret, sig)),
      login: "renamed",
      gitUsername: "transport-user",
    });
    const c = await f.sessions.login(
      "",
      "sample",
      "first",
      "自定义用户名",
      signal(),
    );
    assert.equal(c.connection.id, a.connection.id);
    assert.equal(c.connection.label, "自定义用户名");
    const lease = await f.sessions.lease(c.cookie, c.connection.id);
    assert.equal(lease.context.gitUsername, "transport-user");
    assert.equal(lease.context.identity.login, "renamed");
    lease.release();
  } finally {
    await f.cleanup();
  }
});
test("optional display usernames default to the Git account and never become authentication input", async () => {
  const f = await personalFixture();
  try {
    const authenticate = f.provider.authenticate;
    f.provider.authenticate = async (...args) => {
      assert.equal(args.length, 2);
      return authenticate(...args);
    };
    let workspaceId: string | undefined;
    for (const username of [undefined, "", "   "]) {
      const response = await sessionResponse(
        req("POST", "", { providerId: "sample", token: "first", username }),
        f.sessions,
      );
      assert.equal(response.status, 201);
      const { connection } = await response.json();
      assert.equal(connection.label, "reader");
      assert.equal(connection.identity.login, "reader");
      workspaceId ??= connection.id;
      assert.equal(connection.id, workspaceId);
    }
    const response = await sessionResponse(
      req("POST", "", { ...input(), username: "  用户名: 自己填写  " }),
      f.sessions,
    );
    assert.equal(response.status, 201);
    const { connection } = await response.json();
    assert.equal(connection.id, workspaceId);
    assert.equal(connection.label, "用户名: 自己填写");
    const lease = await f.sessions.lease(cookieOf(response), workspaceId);
    assert.equal(lease.context.gitUsername, "reader");
    assert.equal(lease.context.identity.login, "reader");
    lease.release();
    const restored = await f.sessions.login(
      "",
      "sample",
      "first",
      "",
      signal(),
    );
    assert.equal(restored.connection.label, connection.label);
    assert.equal(restored.connection.id, workspaceId);
    const renamed = await f.sessions.login(
      "",
      "sample",
      "first",
      "另一个名称",
      signal(),
    );
    assert.equal(renamed.connection.id, workspaceId);
    const other = await f.sessions.login(
      "",
      "sample",
      "third",
      "另一个名称",
      signal(),
    );
    assert.notEqual(other.connection.id, workspaceId);
  } finally {
    await f.cleanup();
  }
});
test("failed switch retains old session; successful switch revokes only the switching device", async () => {
  const f = await personalFixture();
  try {
    const a = await f.connect(),
      other = await f.connect();
    const lease = await f.sessions.lease(a.cookie, a.connection.id);
    f.controls.identityInvalid = true;
    await assert.rejects(() => f.connect(a.cookie, "new-token"), {
      code: "TOKEN_INVALID",
    });
    f.controls.identityInvalid = false;
    await lease.assertCurrent();
    const switched = await f.connect(a.cookie, "new-token");
    assert.notEqual(switched.connection.id, a.connection.id);
    assert.equal((await f.sessions.get(a.cookie)).connected, false);
    assert.equal((await f.sessions.get(other.cookie)).connected, true);
    assert.equal(lease.context.signal.aborted, true);
    await assert.rejects(() => lease.assertCurrent());
    lease.release();
  } finally {
    await f.cleanup();
  }
});
test("logout and expiry revoke devices while credentials remain recoverable; logout-all spares other tokens", async () => {
  const f = await personalFixture();
  try {
    const a = await f.connect(),
      b = await f.connect(),
      other = await f.connect("", "third");
    const lease = await f.sessions.lease(a.cookie, a.connection.id);
    await f.sessions.remove(a.cookie);
    assert.equal(lease.context.signal.aborted, true);
    assert.equal((await f.sessions.get(b.cookie)).connected, true);
    lease.release();
    const restored = await f.connect();
    assert.equal(restored.connection.id, a.connection.id);
    const all = await f.sessions.lease(b.cookie, b.connection.id);
    await f.sessions.remove(restored.cookie, undefined, true);
    await assert.rejects(() => all.assertCurrent());
    all.release();
    assert.equal((await f.sessions.get(b.cookie)).connected, false);
    assert.equal((await f.sessions.get(other.cookie)).connected, true);
    assert.equal((await f.connect()).connection.id, a.connection.id);
  } finally {
    await f.cleanup();
  }
});
test("daily idle renewal is bounded by absolute lifetime and inactivity retains workspace", async () => {
  const f = await personalFixture();
  let now = Date.now();
  const store = new PersonalSessions(
    f.sessions.root,
    f.registry,
    f.sessions.keyPath,
    () => now,
  );
  try {
    const a = await store.login("", "sample", "first", "reader", signal());
    const start = now;
    now += 25 * 60 * 60 * 1000;
    const renewed = await store.get(a.cookie);
    assert.equal(renewed.renewed, true);
    assert.equal(renewed.expiresAt, now + sessionIdleTtl);
    assert.equal((await store.get(a.cookie)).renewed, undefined);
    for (let day = 2; day <= 89; day++) {
      now = start + day * 24 * 60 * 60 * 1000;
      await store.get(a.cookie);
    }
    assert.equal(
      (await store.get(a.cookie)).expiresAt,
      start + sessionAbsoluteTtl,
    );
    now = start + sessionAbsoluteTtl;
    assert.equal((await store.get(a.cookie)).connected, false);
    const again = await store.login("", "sample", "first", "reader", signal());
    assert.equal(again.connection.id, a.connection.id);
    now += sessionIdleTtl + 1;
    assert.equal((await store.get(again.cookie)).connected, false);
    assert.equal(
      JSON.parse(await readFile(join(store.root, "state.json"), "utf8"))
        .workspaces.length,
      1,
    );
  } finally {
    await f.cleanup();
  }
});
test("missing keys and swapped ciphertext fail closed and preserve stored data", async () => {
  const f = await personalFixture();
  try {
    const a = await f.connect(),
      b = await f.connect("", "third"),
      path = join(f.sessions.root, "state.json"),
      original = await readFile(path, "utf8"),
      state = JSON.parse(original);
    const [w1, w2] = state.workspaces;
    [w1.ciphertext, w2.ciphertext] = [w2.ciphertext, w1.ciphertext];
    await writeFile(path, JSON.stringify(state));
    await assert.rejects(() => f.sessions.get(a.cookie), {
      code: "CREDENTIAL_UNREADABLE",
    });
    await writeFile(path, original);
    for (const keyPath of [f.sessions.keyPath, f.sessions.identityKeyPath]) {
      const bytes = await readFile(keyPath);
      await unlink(keyPath);
      await assert.rejects(() => f.sessions.get(b.cookie), {
        code: "CREDENTIAL_KEY_UNAVAILABLE",
      });
      assert.equal(await readFile(path, "utf8"), original);
      await assert.rejects(() => stat(keyPath));
      await writeFile(keyPath, bytes, { mode: 0o600 });
    }
    assert.equal((await f.sessions.get(a.cookie)).connected, true);
  } finally {
    await f.cleanup();
  }
});
test("device limit preserves existing sessions and admits a replacement current device", async () => {
  const f = await personalFixture();
  try {
    const devices = [];
    for (let n = 0; n < 32; n++) devices.push(await f.connect());
    await assert.rejects(() => f.connect(), { code: "SESSION_LIMIT" });
    const switched = await f.connect(devices[0].cookie);
    assert.equal((await f.sessions.get(switched.cookie)).connected, true);
    assert.equal((await f.sessions.get(devices[1].cookie)).connected, true);
  } finally {
    await f.cleanup();
  }
});
test("session HTTP issues independent secure cookies and clears logout cookies", async () => {
  const f = await personalFixture();
  try {
    const a = await sessionResponse(req("POST", "", input()), f.sessions);
    assert.equal(a.status, 201);
    const cookie = cookieOf(a);
    assert.match(a.headers.get("set-cookie")!, /HttpOnly; SameSite=Lax/);
    assert.match(a.headers.get("set-cookie")!, /Secure$/);
    assert.equal(a.headers.get("cache-control"), "private, no-store");
    const body = await a.json();
    assert.ok(!JSON.stringify(body).includes('"first"'));
    const b = await sessionResponse(req("POST", "", input()), f.sessions);
    assert.equal(
      (await b.json()).session.workspace.id,
      body.session.workspace.id,
    );
    assert.notEqual(cookieOf(b), cookie);
    const current = await sessionResponse(req("GET", cookie), f.sessions);
    assert.equal(
      (await current.json()).workspace.id,
      body.session.workspace.id,
    );
    const logout = await sessionResponse(req("DELETE", cookie), f.sessions);
    assert.match(logout.headers.get("set-cookie")!, /Max-Age=0/);
    assert.equal((await f.sessions.get(cookieOf(b))).connected, true);
    assert.equal(
      (await logoutAllResponse(req("POST", cookieOf(b)), f.sessions)).status,
      200,
    );
    assert.equal((await f.sessions.get(cookieOf(b))).connected, false);
  } finally {
    await f.cleanup();
  }
});
test("HTTP login rejects cross-site, malformed username and token, oversized requests and untrusted providers", async () => {
  const f = await personalFixture();
  try {
    for (const headers of [
      { origin: "https://else.test" },
      { origin: "null" },
      { "sec-fetch-site": "cross-site" },
    ] as Record<string, string>[])
      assert.equal(
        (await sessionResponse(req("POST", "", input(), headers), f.sessions))
          .status,
        403,
      );
    const absent = req("POST", "", input());
    absent.headers.delete("origin");
    assert.equal((await sessionResponse(absent, f.sessions)).status, 403);
    for (const body of [
      { ...input(), username: "bad\nname" },
      { ...input(), username: "a".repeat(101) },
      { ...input(), username: null },
      { ...input(), token: "a\nb" },
      { ...input(), token: "" },
      { ...input(), workspaceId: "forged" },
      { ...input(), providerId: "unknown" },
    ])
      assert.equal(
        (await sessionResponse(req("POST", "", body), f.sessions)).status,
        400,
      );
    assert.equal(
      (
        await sessionResponse(
          req("POST", "", input("a".repeat(17000))),
          f.sessions,
        )
      ).status,
      413,
    );
    f.provider.authenticate = async () => {
      throw new ProviderError("TOKEN_INVALID", "Invalid token", 400);
    };
    assert.equal(
      (await sessionResponse(req("POST", "", input()), f.sessions)).status,
      400,
    );
  } finally {
    await f.cleanup();
  }
});
test("reverse proxy uses actual external Host and rejects forwarded-host, missing origin and plaintext", async () => {
  const f = await personalFixture();
  const proxy = (
    overrides: Record<string, string> = {},
    omit: string[] = [],
  ) => {
    const headers = new Headers({
      host: "folio.test",
      origin: "https://folio.test",
      "x-forwarded-proto": "https",
      "content-type": "application/json",
      ...overrides,
    });
    omit.forEach((k) => headers.delete(k));
    return new Request("http://localhost:10680/api/session", {
      method: "POST",
      headers,
      body: JSON.stringify(input()),
    });
  };
  try {
    const response = await sessionResponse(proxy(), f.sessions);
    assert.equal(response.status, 201);
    assert.match(response.headers.get("set-cookie")!, /; Secure$/);
    for (const r of [
      proxy({ origin: "https://other.test" }),
      proxy({ origin: "https://other.test", "x-forwarded-host": "other.test" }),
      proxy({}, ["origin"]),
      proxy({ host: "folio.test/ignored" }),
    ])
      assert.equal((await sessionResponse(r, f.sessions)).status, 403);
    assert.equal(
      (
        await sessionResponse(
          proxy({ origin: "http://folio.test" }, ["x-forwarded-proto"]),
          f.sessions,
        )
      ).status,
      400,
    );
  } finally {
    await f.cleanup();
  }
});

test("trusted provider instances isolate identical tokens", async () => {
  const f = await personalFixture();
  try {
    const a = await f.connect();
    const originalDescription = f.provider.describeConnection;
    const originalAuthenticate = f.provider.authenticate;
    f.provider.describeConnection = () => ({
      ...originalDescription(),
      instance: "another.test",
    });
    f.provider.authenticate = async (secret, sig) => ({
      ...(await originalAuthenticate(secret, sig)),
      instanceId: "another.test",
    });
    const b = await f.connect();
    assert.notEqual(a.connection.id, b.connection.id);
    assert.equal(
      (await f.sessions.get(a.cookie)).workspace?.identity.instanceId,
      "sample.test",
    );
  } finally {
    await f.cleanup();
  }
});

test("daily renewal and invalid old GET responses cannot overwrite a switched Cookie", async (t) => {
  const f = await personalFixture();
  t.after(f.cleanup);
  let now = Date.now();
  const store = new PersonalSessions(
    join(f.root, "cookie-race"),
    f.registry,
    join(f.root, "race-key"),
    () => now,
  );
  const a = await store.login("", "sample", "first", "reader", signal());
  const initial = await sessionResponse(
    req("POST", "", {
      providerId: "sample",
      username: "reader",
      token: "first",
    }),
    store,
  );
  const maxAge = Number(
    initial.headers.get("set-cookie")!.match(/Max-Age=(\d+)/)![1],
  );
  assert.ok(maxAge > 89 * 24 * 60 * 60);
  now += 2 * 24 * 60 * 60 * 1000;
  const get = store.get.bind(store);
  let captured!: () => void, release!: () => void;
  const blocked = new Promise<void>((r) => {
    captured = r;
  });
  const gate = new Promise<void>((r) => {
    release = r;
  });
  store.get = async (cookie) => {
    const result = await get(cookie);
    captured();
    await gate;
    return result;
  };
  const old = sessionResponse(req("GET", a.cookie), store);
  await blocked;
  const b = await store.login(a.cookie, "sample", "second", "reader", signal());
  release();
  assert.equal((await old).headers.get("set-cookie"), null);
  store.get = get;
  assert.equal(
    (await sessionResponse(req("GET", a.cookie), store)).headers.get(
      "set-cookie",
    ),
    null,
  );
  assert.equal((await store.get(b.cookie)).connected, true);
});

test("invalid workspace state is rejected without rewriting credentials or sessions", async () => {
  const f = await personalFixture();
  try {
    const logged = await f.connect();
    const path = join(f.sessions.root, "state.json");
    const original = await readFile(path, "utf8");
    const state = JSON.parse(original);
    for (const invalid of [
      { ...state, unknown: [] },
      { ...state, workspaces: [{ ...state.workspaces[0], unknown: [] }] },
      { ...state, schemaVersion: 0 },
    ]) {
      const body = JSON.stringify(invalid);
      await writeFile(path, body);
      await assert.rejects(f.sessions.get(logged.cookie), {
        code: "SESSION_DATA_INVALID",
      });
      await assert.rejects(f.connect(), { code: "SESSION_DATA_INVALID" });
      assert.equal(await readFile(path, "utf8"), body);
    }
    await writeFile(path, original);
    assert.equal(
      (await f.sessions.get(logged.cookie)).workspace?.id,
      logged.connection.id,
    );
  } finally {
    await f.cleanup();
  }
});
