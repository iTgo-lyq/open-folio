import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  rm,
  readFile,
  writeFile,
  stat,
  unlink,
} from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { PersonalSessions } from "../src/server/personal-sessions.ts";
import { ProviderRegistry } from "../src/server/providers/registry.ts";
import {
  ProviderError,
  type RepositoryProvider,
} from "../src/server/providers/types.ts";
import {
  connectionResponse,
  sessionResponse,
} from "../src/server/connection-api.ts";
const signal = () => new AbortController().signal;
async function setup() {
  const root = await mkdtemp(join(tmpdir(), "folio-session-test-"));
  const provider: RepositoryProvider = {
    id: "sample",
    parseRepositoryUrl: () => ({ fullName: "group/project" }),
    describeConnection: () => ({
      id: "sample",
      name: "Sample",
      instance: "sample.test",
      tokenUrl: "https://sample.test/tokens",
      permissions: ["read"],
    }),
    authenticate: async (secret) =>
      secret.use((value) => {
        if (value === "invalid")
          throw new ProviderError(
            "TOKEN_INVALID",
            "Invalid fixture token",
            401,
          );
        return {
          providerId: "sample",
          instanceId: "sample.test",
          subjectId: value.startsWith("other") ? "2" : "1",
          login: value.startsWith("other") ? "other" : "reader",
          displayName: "Fixture",
        };
      }),
    listRepositories: async () => ({ items: [], nextCursor: null }),
    resolveRepository: async () => {
      throw new Error();
    },
    assertRead: async () => {},
    probeWorkflow: async () => ({ kind: "empty-repository" }),
    gitTransport: async () => {
      throw new Error();
    },
  };
  const registry = new ProviderRegistry([provider]),
    store = new PersonalSessions(root, registry, join(root, "credential-key"));
  return {
    root,
    store,
    registry,
    connect: (cookie = "", token = "sample-secret", replace?: string) =>
      store.connect(cookie, "sample", token, undefined, signal(), replace),
    cleanup: () => rm(root, { recursive: true, force: true }),
  };
}
test("sessions persist encrypted secrets, hash cookies and keep independent same-account connections", async () => {
  const f = await setup();
  try {
    const first = await f.connect(),
      id = first.connection.id;
    const second = await f.connect(first.cookie);
    assert.notEqual(first.cookie, second.cookie);
    assert.equal((await f.store.get(first.cookie)).connected, false);
    assert.equal(second.session.connections.length, 2);
    const body = await readFile(join(f.root, "sessions.json"), "utf8");
    assert.ok(!body.includes("sample-secret"));
    assert.ok(!body.includes(second.cookie));
    assert.ok(!JSON.stringify(second.session).includes("ciphertext"));
    const parsed = JSON.parse(body);
    assert.notEqual(
      parsed.sessions[0].connections[0].nonce,
      parsed.sessions[0].connections[1].nonce,
    );
    assert.equal(
      (await stat(join(f.root, "sessions.json"))).mode & 0o777,
      0o600,
    );
    assert.equal(
      (await stat(join(f.root, "credential-key"))).mode & 0o777,
      0o600,
    );
    const restarted = new PersonalSessions(
      f.root,
      f.registry,
      join(f.root, "credential-key"),
    );
    assert.equal((await restarted.get(second.cookie)).connections.length, 2);
    const lease = await restarted.lease(second.cookie, id);
    assert.equal(
      lease.context.secret.use((v) => v),
      "sample-secret",
    );
    await lease.assertCurrent();
    lease.release();
  } finally {
    await f.cleanup();
  }
});
test("failed replacement preserves credentials; successful rotation cancels previous operations", async () => {
  const f = await setup();
  try {
    const first = await f.connect();
    const lease = await f.store.lease(first.cookie, first.connection.id);
    await assert.rejects(
      () => f.connect(first.cookie, "invalid", first.connection.id),
      { code: "TOKEN_INVALID" },
    );
    await assert.rejects(
      () => f.connect(first.cookie, "other-secret", first.connection.id),
      { code: "IDENTITY_CHANGED" },
    );
    await lease.assertCurrent();
    assert.equal((await f.store.get(first.cookie)).connected, true);
    const replacement = await f.connect(
      first.cookie,
      "replacement-secret",
      first.connection.id,
    );
    assert.equal(replacement.connection.revision, 2);
    assert.equal(replacement.connection.id, first.connection.id);
    assert.equal(lease.context.signal.aborted, true);
    await assert.rejects(() => lease.assertCurrent());
    lease.release();
    const fresh = await f.store.lease(
      replacement.cookie,
      replacement.connection.id,
    );
    assert.equal(
      fresh.context.secret.use((v) => v),
      "replacement-secret",
    );
    fresh.release();
  } finally {
    await f.cleanup();
  }
});
test("ownership, removal, logout and expiry invalidate access, including in-flight operations", async () => {
  const f = await setup();
  try {
    const one = await f.connect(),
      two = await f.connect("", "other-secret");
    await assert.rejects(() => f.store.lease(two.cookie, one.connection.id), {
      code: "SESSION_REQUIRED",
    });
    await assert.rejects(() => f.store.remove(two.cookie, one.connection.id), {
      code: "SESSION_REQUIRED",
    });
    const lease = await f.store.lease(one.cookie, one.connection.id);
    const removed = await f.store.remove(one.cookie, one.connection.id);
    assert.equal(removed.connected, false);
    assert.equal(lease.context.signal.aborted, true);
    assert.equal((await f.store.get(two.cookie)).connected, true);
    lease.release();
    const active = await f.store.lease(two.cookie, two.connection.id);
    const data = JSON.parse(
      await readFile(join(f.root, "sessions.json"), "utf8"),
    );
    data.sessions[0].expiresAt = Date.now() - 1;
    await writeFile(join(f.root, "sessions.json"), JSON.stringify(data));
    await assert.rejects(() => active.assertCurrent());
    assert.equal((await f.store.get(two.cookie)).connected, false);
    assert.deepEqual(
      JSON.parse(await readFile(join(f.root, "sessions.json"), "utf8"))
        .sessions,
      [],
    );
    active.release();
    const three = await f.connect();
    await f.store.remove(three.cookie);
    assert.equal((await f.store.get(three.cookie)).connected, false);
  } finally {
    await f.cleanup();
  }
});
test("lost key and swapped ciphertext are rejected without destroying stored connections", async () => {
  const f = await setup();
  try {
    const first = await f.connect(),
      second = await f.connect(first.cookie);
    const path = join(f.root, "sessions.json"),
      original = await readFile(path, "utf8"),
      data = JSON.parse(original),
      [a, b] = data.sessions[0].connections;
    [a.ciphertext, b.ciphertext] = [b.ciphertext, a.ciphertext];
    await writeFile(path, JSON.stringify(data));
    await assert.rejects(() => f.store.get(second.cookie), {
      code: "CREDENTIAL_UNREADABLE",
    });
    await writeFile(path, original);
    const key = await readFile(join(f.root, "credential-key"));
    await unlink(join(f.root, "credential-key"));
    await assert.rejects(() => f.store.get(second.cookie), {
      code: "CREDENTIAL_KEY_UNAVAILABLE",
    });
    assert.equal(await readFile(path, "utf8"), original);
    await assert.rejects(() => stat(join(f.root, "credential-key")));
    await writeFile(join(f.root, "credential-key"), key, { mode: 0o600 });
    assert.equal((await f.store.get(second.cookie)).connected, true);
  } finally {
    await f.cleanup();
  }
});
const request = (
  method: string,
  cookie = "",
  body?: unknown,
  headers: Record<string, string> = {},
) =>
  new Request("https://folio.test/api/connections", {
    method,
    headers: {
      origin: "https://folio.test",
      "content-type": "application/json",
      ...(cookie ? { cookie: `openfolio-session=${cookie}` } : {}),
      ...headers,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
test("HTTP connection lifecycle rotates secure cookies without returning credentials", async () => {
  const f = await setup();
  try {
    const response = await connectionResponse(
      request("POST", "", { providerId: "sample", token: "sample-secret" }),
      undefined,
      f.store,
    );
    assert.equal(response.status, 201);
    const cookie = response.headers.get("set-cookie")!;
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /SameSite=Lax/);
    assert.match(cookie, /Secure/);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    const body = await response.json();
    assert.ok(!JSON.stringify(body).includes("sample-secret"));
    const token = cookie.split(";")[0].split("=")[1];
    const current = await sessionResponse(request("GET", token), f.store);
    assert.equal((await current.json()).connections.length, 1);
    const replaced = await connectionResponse(
      request("PATCH", token, {
        providerId: "sample",
        token: "replacement-secret",
      }),
      body.connection.id,
      f.store,
    );
    assert.equal(replaced.status, 200);
    assert.notEqual(replaced.headers.get("set-cookie"), cookie);
    const updated = replaced.headers
      .get("set-cookie")!
      .split(";")[0]
      .split("=")[1];
    const logout = await sessionResponse(request("DELETE", updated), f.store);
    assert.equal((await logout.json()).connected, false);
    assert.match(logout.headers.get("set-cookie")!, /Max-Age=0/);
  } finally {
    await f.cleanup();
  }
});
test("HTTP writes reject cross-origin, missing origin, malformed input and oversized bodies", async () => {
  const f = await setup();
  try {
    for (const headers of [
      { origin: "https://else.test" },
      { origin: "null" },
      { origin: "http://folio.test" },
      { "sec-fetch-site": "cross-site" },
    ] as Record<string, string>[])
      assert.equal(
        (
          await connectionResponse(
            request(
              "POST",
              "",
              { providerId: "sample", token: "sample-secret" },
              headers,
            ),
            undefined,
            f.store,
          )
        ).status,
        403,
      );
    const absent = new Request("https://folio.test/api/connections", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    assert.equal(
      (await connectionResponse(absent, undefined, f.store)).status,
      403,
    );
    for (const token of ["a\nb", "", "a".repeat(4097)])
      assert.equal(
        (
          await connectionResponse(
            request("POST", "", { providerId: "sample", token }),
            undefined,
            f.store,
          )
        ).status,
        400,
      );
    assert.equal(
      (
        await connectionResponse(
          request("POST", "", {
            providerId: "sample",
            token: "a".repeat(17000),
          }),
          undefined,
          f.store,
        )
      ).status,
      413,
    );
    assert.equal(
      (
        await connectionResponse(
          request("POST", "", {
            providerId: "unregistered",
            token: "sample-secret",
          }),
          undefined,
          f.store,
        )
      ).status,
      400,
    );
  } finally {
    await f.cleanup();
  }
});
test("same-process stores serialize new sessions without losing concurrent writes", async () => {
  const f = await setup();
  try {
    const another = new PersonalSessions(
      f.root,
      f.registry,
      join(f.root, "credential-key"),
    );
    const [a, b] = await Promise.all([
      f.connect(),
      another.connect("", "sample", "other-secret", undefined, signal()),
    ]);
    assert.equal((await f.store.get(a.cookie)).connected, true);
    assert.equal((await another.get(b.cookie)).connected, true);
    assert.equal(
      JSON.parse(await readFile(join(f.root, "sessions.json"), "utf8")).sessions
        .length,
      2,
    );
  } finally {
    await f.cleanup();
  }
});

test("reverse proxy writes use the external Host while retaining origin and HTTPS checks", async () => {
  const f = await setup();
  const proxyRequest = (
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
    omit.forEach((key) => headers.delete(key));
    return new Request("http://localhost:10680/api/connections", {
      method: "POST",
      headers,
      body: JSON.stringify({ providerId: "sample", token: "sample-secret" }),
    });
  };
  try {
    const response = await connectionResponse(
      proxyRequest(),
      undefined,
      f.store,
    );
    assert.equal(response.status, 201);
    assert.match(response.headers.get("set-cookie")!, /; Secure$/);
    for (const request of [
      proxyRequest({ origin: "https://other.test" }),
      proxyRequest({
        origin: "https://other.test",
        "x-forwarded-host": "other.test",
      }),
      proxyRequest({ "sec-fetch-site": "cross-site" }),
      proxyRequest({}, ["origin"]),
      proxyRequest({ host: "folio.test/ignored" }),
    ])
      assert.equal(
        (await connectionResponse(request, undefined, f.store)).status,
        403,
      );
    const plaintext = await connectionResponse(
      proxyRequest({ origin: "http://folio.test" }, ["x-forwarded-proto"]),
      undefined,
      f.store,
    );
    assert.equal(plaintext.status, 400);
    assert.equal((await plaintext.json()).error.code, "HTTPS_REQUIRED");
  } finally {
    await f.cleanup();
  }
});
