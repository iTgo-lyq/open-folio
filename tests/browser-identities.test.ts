import test from "node:test";
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { personalFixture } from "./personal-fixture.ts";
import {
  PersonalSessions,
  cookieHash,
  sessionIdleTtl,
} from "../src/server/personal-sessions.ts";
import {
  sessionResponse,
  switchIdentityResponse,
  removeIdentityResponse,
} from "../src/server/connection-api.ts";
import { rotateWorkspaceKeys } from "../src/server/workspace-key-rotation.ts";
import { tokenResponse } from "../src/server/credential-api.ts";
import { ProviderError } from "../src/server/providers/types.ts";
const signal = () => new AbortController().signal;
const request = (cookie: string, body: unknown, revision?: number) =>
  new Request("https://folio.test/api/session/switch", {
    method: "POST",
    headers: {
      origin: "https://folio.test",
      "Content-Type": "application/json",
      cookie: `openfolio-session=${cookie}`,
      ...(revision === undefined
        ? {}
        : { "X-OpenFolio-Revision": String(revision) }),
    },
    body: JSON.stringify(body),
  });
test("one browser remembers distinct tokens, restores preferences and cancels old A even after A-B-A", async (t) => {
  const f = await personalFixture();
  t.after(f.cleanup);
  const a = await f.connect();
  await f.sessions.updatePreferences(a.cookie, { module: "changes" });
  const old = await f.sessions.lease(a.cookie, a.connection.id);
  const b = await f.connect(a.cookie, "third");
  assert.equal(a.cookie, b.cookie);
  assert.equal(
    a.connection.identity.subjectId,
    b.connection.identity.subjectId,
  );
  assert.notEqual(a.connection.id, b.connection.id);
  assert.deepEqual(b.session.workspace?.preferences, {});
  const target = b.session.identities.find(
    (i) => i.connection.id === a.connection.id,
  )!;
  const restored = await f.sessions.switchIdentity(
    a.cookie,
    target.id,
    signal(),
  );
  assert.equal(restored.session.workspace?.preferences.module, "changes");
  assert.equal(restored.session.identities.length, 2);
  await assert.rejects(old.assertCurrent);
  old.release();
  const current = await f.sessions.lease(a.cookie, a.connection.id);
  await current.assertCurrent();
  current.release();
  const restarted = new PersonalSessions(
    f.sessions.root,
    f.registry,
    f.sessions.keyPath,
  );
  assert.deepEqual(await restarted.get(a.cookie), restored.session);
  const repeated = await f.connect(a.cookie, "third");
  assert.equal(repeated.session.identities.length, 2);
  assert.equal(repeated.connection.id, b.connection.id);
});
test("failed saved identity validation retains current identity and both grants", async (t) => {
  const f = await personalFixture();
  t.after(f.cleanup);
  const a = await f.connect(),
    b = await f.connect(a.cookie, "third");
  const target = b.session.identities.find((i) => !i.current)!;
  const authenticate = f.provider.authenticate;
  for (const code of [
    "TOKEN_INVALID",
    "PROVIDER_UNAVAILABLE",
    "RATE_LIMITED",
  ] as const) {
    f.provider.authenticate = async () => {
      throw new ProviderError(code, "fixture failure", 503);
    };
    await assert.rejects(
      f.sessions.switchIdentity(a.cookie, target.id, signal()),
      { code },
    );
    const current = await f.sessions.get(a.cookie);
    assert.equal(current.workspace?.id, b.connection.id);
    assert.equal(current.identities.length, 2);
    assert.equal(current.browserRevision, b.session.browserRevision);
  }
  f.provider.authenticate = authenticate;
});
test("a delayed switch cannot restore a device after logout changes the collection", async (t) => {
  const f = await personalFixture();
  t.after(f.cleanup);
  const a = await f.connect(),
    b = await f.connect(a.cookie, "third");
  const target = b.session.identities.find((i) => !i.current)!;
  let release!: () => void, started!: () => void;
  const pending = new Promise<void>((r) => (release = r)),
    entered = new Promise<void>((r) => (started = r));
  const authenticate = f.provider.authenticate;
  f.provider.authenticate = async (secret, sig) => {
    started();
    await pending;
    return authenticate(secret, sig);
  };
  const switching = f.sessions.switchIdentity(a.cookie, target.id, signal());
  await entered;
  await f.sessions.remove(a.cookie);
  release();
  await assert.rejects(switching, { code: "SESSION_CHANGED" });
  const current = await f.sessions.get(a.cookie);
  assert.equal(current.connected, false);
  assert.equal(current.identities.length, 1);
});
test("saved identities are browser-owned and HTTP requires current revision and a strict target", async (t) => {
  const f = await personalFixture();
  t.after(f.cleanup);
  const a = await f.connect(),
    other = await f.connect(),
    b = await f.connect(a.cookie, "third");
  const id = b.session.identities.find((i) => !i.current)!.id;
  await assert.rejects(f.sessions.switchIdentity(other.cookie, id, signal()), {
    code: "IDENTITY_REQUIRED",
  });
  assert.equal(
    (
      await switchIdentityResponse(
        request(a.cookie, { identityId: id }),
        f.sessions,
      )
    ).status,
    409,
  );
  assert.equal(
    (
      await switchIdentityResponse(
        request(a.cookie, { identityId: id }, 1),
        f.sessions,
      )
    ).status,
    409,
  );
  assert.equal(
    (
      await switchIdentityResponse(
        request(a.cookie, { identityId: id, token: "first" }, 2),
        f.sessions,
      )
    ).status,
    400,
  );
  const response = await switchIdentityResponse(
    request(a.cookie, { identityId: id }, 2),
    f.sessions,
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("set-cookie"), null);
  assert.equal((await f.sessions.get(a.cookie)).workspace?.id, a.connection.id);
});
test("old current revision cannot copy the newly selected token", async (t) => {
  const f = await personalFixture();
  t.after(f.cleanup);
  const a = await f.connect();
  await f.connect(a.cookie, "third");
  const req = request(a.cookie, {}, 1);
  const response = await tokenResponse(req, f.sessions);
  assert.equal(response.status, 409);
  assert.ok(!(await response.text()).includes('"token"'));
});
test("inactive grants expire independently and switching never resets absolute lifetime", async (t) => {
  const f = await personalFixture();
  t.after(f.cleanup);
  let now = Date.now();
  const store = new PersonalSessions(
    f.sessions.root,
    f.registry,
    f.sessions.keyPath,
    () => now,
  );
  const a = await store.login("", "sample", "first", undefined, signal());
  const target = a.session.identities[0];
  now += sessionIdleTtl - 1000;
  const b = await store.login(a.cookie, "sample", "third", undefined, signal());
  now += 1001;
  await assert.rejects(store.switchIdentity(a.cookie, target.id, signal()), {
    code: "IDENTITY_REQUIRED",
  });
  assert.equal((await store.get(a.cookie)).workspace?.id, b.connection.id);
  const c = await store.login(a.cookie, "sample", "first", undefined, signal());
  const originalExpiry = c.session.absoluteExpiresAt;
  for (let n = 0; n < 3; n++) {
    now += 1000;
    for (const identity of c.session.identities)
      await store.switchIdentity(a.cookie, identity.id, signal());
  }
  const current = await store.get(a.cookie);
  assert.equal(current.absoluteExpiresAt, originalExpiry);
});
test("version 2 only retains encrypted workspaces; old cookies are invalid and re-login keeps IDs", async (t) => {
  const f = await personalFixture();
  t.after(f.cleanup);
  const a = await f.connect();
  await f.sessions.updatePreferences(a.cookie, { railCollapsed: true });
  const path = join(f.sessions.root, "state.json"),
    original = JSON.parse(await readFile(path, "utf8"));
  const { browserId: _browserId, ...device } = original.sessions[0];
  const legacy = JSON.stringify({
    schemaVersion: 2,
    workspaces: original.workspaces,
    sessions: [{ ...device, cookieHash: cookieHash(a.cookie) }],
  });
  await writeFile(path, legacy);
  const retired = await f.sessions.get(a.cookie);
  assert.equal(retired.connected, false);
  assert.deepEqual(retired.identities, []);
  assert.equal(await readFile(path, "utf8"), legacy);
  const next = await f.connect(a.cookie);
  assert.notEqual(next.cookie, a.cookie);
  assert.equal(next.connection.id, a.connection.id);
  assert.equal(next.session.workspace?.preferences.railCollapsed, true);
  assert.equal(JSON.parse(await readFile(path, "utf8")).schemaVersion, 3);
  assert.equal((await f.sessions.get(a.cookie)).connected, false);
});
test("late token add with stale revision cannot change the selected identity", async (t) => {
  const f = await personalFixture();
  t.after(f.cleanup);
  const a = await f.connect();
  let release!: () => void, entered!: () => void;
  const gate = new Promise<void>((r) => (release = r)),
    start = new Promise<void>((r) => (entered = r));
  const authenticate = f.provider.authenticate;
  f.provider.authenticate = async (secret, sig) => {
    if (secret.use((v) => v) === "third") {
      entered();
      await gate;
    }
    return authenticate(secret, sig);
  };
  const adding = sessionResponse(
    request(a.cookie, { providerId: "sample", token: "third" }, 1),
    f.sessions,
  );
  await start;
  await f.connect(a.cookie, "second");
  release();
  assert.equal((await adding).status, 409);
  assert.equal((await f.sessions.get(a.cookie)).identities.length, 2);
});
test("removing a non-current identity leaves current delivery and another browser intact", async (t) => {
  const f = await personalFixture();
  t.after(f.cleanup);
  const a = await f.connect(),
    other = await f.connect(),
    b = await f.connect(a.cookie, "third");
  const lease = await f.sessions.lease(a.cookie, b.connection.id);
  const response = await removeIdentityResponse(
    new Request("https://folio.test/api/session/identities/x", {
      method: "DELETE",
      headers: {
        origin: "https://folio.test",
        cookie: `openfolio-session=${a.cookie}`,
        "X-OpenFolio-Revision": "2",
      },
    }),
    a.session.deviceSessionId!,
    f.sessions,
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("set-cookie"), null);
  const current = await f.sessions.get(a.cookie);
  assert.equal(current.workspace?.id, b.connection.id);
  assert.equal(current.selectionRevision, b.session.selectionRevision);
  await lease.assertCurrent();
  lease.release();
  assert.equal(current.identities.length, 1);
  assert.equal((await f.sessions.get(other.cookie)).connected, true);
  await assert.rejects(
    f.sessions.switchIdentity(a.cookie, a.session.deviceSessionId!, signal()),
    { code: "IDENTITY_REQUIRED" },
  );
  assert.equal(
    JSON.parse(await readFile(join(f.sessions.root, "state.json"), "utf8"))
      .workspaces.length,
    2,
  );
});
test("removing the current identity leaves a selection of other remembered identities", async (t) => {
  const f = await personalFixture();
  t.after(f.cleanup);
  const a = await f.connect(),
    b = await f.connect(a.cookie, "third");
  const lease = await f.sessions.lease(a.cookie, b.connection.id);
  const next = await f.sessions.removeIdentity(
    a.cookie,
    b.session.deviceSessionId!,
  );
  assert.equal(next.connected, false);
  assert.equal(next.identities.length, 1);
  await assert.rejects(lease.assertCurrent);
  lease.release();
  const restored = await f.sessions.switchIdentity(
    a.cookie,
    next.identities[0].id,
    signal(),
  );
  assert.equal(restored.connection.id, a.connection.id);
});
test("another device can revoke a remembered inactive identity without revoking its other current identity", async (t) => {
  const f = await personalFixture();
  t.after(f.cleanup);
  const a = await f.connect(),
    owner = await f.connect(),
    b = await f.connect(a.cookie, "third");
  const lease = await f.sessions.lease(a.cookie, b.connection.id),
    shared = await f.sessions.workspaceLease(owner.cookie, owner.connection.id);
  const devices = await f.sessions.devices(owner.cookie);
  assert.ok(devices.some((d) => d.id === a.session.deviceSessionId));
  await f.sessions.revokeDevice(owner.cookie, a.session.deviceSessionId!);
  await lease.assertCurrent();
  assert.equal((await f.sessions.get(a.cookie)).identities.length, 1);
  await f.sessions.remove(owner.cookie, undefined, true);
  await assert.rejects(shared.assertCurrent);
  shared.release();
  await lease.assertCurrent();
  lease.release();
  assert.equal((await f.sessions.get(a.cookie)).workspace?.id, b.connection.id);
});
test("device revocation clears its selected identity but preserves another saved identity", async (t) => {
  const f = await personalFixture();
  t.after(f.cleanup);
  const a = await f.connect(),
    owner = await f.connect(),
    b = await f.connect(a.cookie, "third");
  await f.sessions.switchIdentity(
    a.cookie,
    a.session.deviceSessionId!,
    signal(),
  );
  const lease = await f.sessions.lease(a.cookie, a.connection.id);
  await f.sessions.revokeDevice(owner.cookie, a.session.deviceSessionId!);
  assert.equal((await f.sessions.get(a.cookie)).connected, false);
  await assert.rejects(lease.assertCurrent);
  lease.release();
  const restored = await f.sessions.switchIdentity(
    a.cookie,
    b.session.deviceSessionId!,
    signal(),
  );
  assert.equal(restored.connection.id, b.connection.id);
  await assert.rejects(
    f.sessions.removeIdentity(owner.cookie, b.session.deviceSessionId!),
    { code: "IDENTITY_NOT_FOUND" },
  );
});
test("invalid browser membership and duplicate grants fail closed without rewriting bytes", async (t) => {
  const f = await personalFixture();
  t.after(f.cleanup);
  const a = await f.connect(),
    other = await f.connect();
  const path = join(f.sessions.root, "state.json"),
    raw = await readFile(path, "utf8"),
    source = JSON.parse(raw);
  const cross = structuredClone(source);
  cross.browsers[0].activeSessionId = other.session.deviceSessionId;
  const duplicate = structuredClone(source);
  duplicate.sessions.push({
    ...duplicate.sessions[0],
    id: crypto.randomUUID(),
  });
  for (const candidate of [cross, duplicate, { ...source, browsers: [] }]) {
    const text = JSON.stringify(candidate);
    await writeFile(path, text);
    await assert.rejects(f.sessions.get(a.cookie), {
      code: "SESSION_DATA_INVALID",
    });
    assert.equal(await readFile(path, "utf8"), text);
  }
  await writeFile(path, raw);
});
test("key rotation preserves a browser's saved identities and selection", async (t) => {
  const f = await personalFixture();
  t.after(f.cleanup);
  const a = await f.connect(),
    b = await f.connect(a.cookie, "third");
  const target = join(f.root, "rotated");
  await rotateWorkspaceKeys(f.sessions.root, target, f.sessions.keyPath);
  const rotated = new PersonalSessions(target, f.registry);
  assert.deepEqual(await rotated.get(a.cookie), b.session);
  const selected = await rotated.switchIdentity(
    a.cookie,
    a.session.deviceSessionId!,
    signal(),
  );
  assert.equal(selected.connection.id, a.connection.id);
});
test("the per-browser limit preserves the selection and permits re-authenticating an existing identity", async (t) => {
  const f = await personalFixture();
  t.after(f.cleanup);
  const a = await f.connect();
  let current = a;
  for (let n = 1; n < 32; n++)
    current = await f.connect(a.cookie, `fixture-token-${n}`);
  const before = await readFile(join(f.sessions.root, "state.json"), "utf8");
  await assert.rejects(f.connect(a.cookie, "over-limit"), {
    code: "SESSION_LIMIT",
  });
  assert.equal(
    await readFile(join(f.sessions.root, "state.json"), "utf8"),
    before,
  );
  assert.equal(
    (await f.sessions.get(a.cookie)).workspace?.id,
    current.connection.id,
  );
  assert.equal((await f.connect(a.cookie)).session.identities.length, 32);
});
