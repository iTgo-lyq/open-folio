import test from "node:test";
import assert from "node:assert/strict";
import { personalFixture } from "./personal-fixture.ts";
import { PersonalSessions } from "../src/server/personal-sessions.ts";
import { ProviderError } from "../src/server/providers/types.ts";
const signal = () => new AbortController().signal;

test("account binding list spans browsers, selections and delivery generations stay independent", async (t) => {
  const f = await personalFixture();
  t.after(f.cleanup);
  const a = await f.connect();
  const b = await f.sessions.login(
    "",
    a.session.account!.username,
    "test-password",
    signal(),
  );
  assert.equal(b.session.connected, false);
  assert.equal(b.session.connections[0].id, a.connection.id);
  await f.sessions.switchConnection(b.cookie, a.connection.id, signal());
  const aLease = await f.sessions.lease(a.cookie, a.connection.id),
    bLease = await f.sessions.lease(b.cookie, a.connection.id);
  const before = await f.sessions.get(b.cookie),
    added = await f.sessions.bind(
      a.cookie,
      "sample",
      "second",
      "work",
      signal(),
    );
  const after = await f.sessions.get(b.cookie);
  assert.equal(after.connections.length, 2);
  assert.equal(after.workspace?.id, a.connection.id);
  assert.equal(after.selectionRevision, before.selectionRevision);
  assert.ok(after.browserRevision! > before.browserRevision!);
  await assert.rejects(aLease.assertCurrent);
  await bLease.assertCurrent();
  await f.sessions.switchConnection(a.cookie, a.connection.id, signal());
  await assert.rejects(aLease.assertCurrent);
  await bLease.assertCurrent();
  assert.notEqual(added.connection.id, a.connection.id);
  aLease.release();
  bLease.release();
});
test("rename and dedup preserve preferences; unbind clears every selecting device and shared work", async (t) => {
  const f = await personalFixture();
  t.after(f.cleanup);
  const a = await f.connect(),
    b = await f.connect();
  await f.sessions.updatePreferences(a.cookie, { module: "changes" });
  const current = await f.sessions.get(a.cookie),
    renamed = await f.sessions.renameConnection(
      a.cookie,
      a.connection.id,
      "project",
      current.browserRevision,
    );
  assert.equal(renamed.connections[0].label, "project");
  await assert.rejects(
    f.sessions.bind(
      a.cookie,
      "sample",
      "second",
      undefined,
      signal(),
      current.browserRevision,
    ),
    { code: "SESSION_CHANGED" },
  );
  const repeated = await f.sessions.bind(
    a.cookie,
    "sample",
    "first",
    undefined,
    signal(),
  );
  assert.equal(repeated.connection.id, a.connection.id);
  assert.equal(repeated.session.connections.length, 1);
  assert.equal(repeated.session.workspace?.preferences.module, "changes");
  const selected = await f.sessions.get(b.cookie),
    lease = await f.sessions.lease(b.cookie, a.connection.id),
    shared = await f.sessions.workspaceLease(b.cookie, a.connection.id);
  await f.sessions.unbind(a.cookie, a.connection.id);
  const after = await f.sessions.get(b.cookie);
  assert.ok(after.authenticated);
  assert.ok(!after.connected);
  assert.deepEqual(after.connections, []);
  assert.ok(after.selectionRevision! > selected.selectionRevision!);
  await assert.rejects(lease.assertCurrent);
  await assert.rejects(shared.assertCurrent);
  lease.release();
  shared.release();
  const rebound = await f.sessions.bind(
    b.cookie,
    "sample",
    "first",
    undefined,
    signal(),
  );
  assert.notEqual(rebound.connection.id, a.connection.id);
});
test("same complete Token in another account cannot enumerate, select, rename, unbind or revoke another account", async (t) => {
  const f = await personalFixture();
  t.after(f.cleanup);
  const a = await f.connect();
  const b = await f.sessions.register("", "other", "test-password", signal());
  const c = await f.sessions.bind(
    b.cookie,
    "sample",
    "first",
    undefined,
    signal(),
  );
  assert.notEqual(a.connection.id, c.connection.id);
  assert.equal(c.session.connections.length, 1);
  for (const operation of [
    () => f.sessions.switchConnection(b.cookie, a.connection.id, signal()),
    () => f.sessions.renameConnection(b.cookie, a.connection.id, "stolen"),
    () => f.sessions.unbind(b.cookie, a.connection.id),
  ])
    await assert.rejects(operation(), { code: "CONNECTION_NOT_FOUND" });
  await assert.rejects(f.sessions.lease(b.cookie, a.connection.id), {
    code: "SESSION_REQUIRED",
  });
  const devices = await f.sessions.devices(a.cookie);
  await assert.rejects(f.sessions.revokeDevice(b.cookie, devices[0].id), {
    code: "DEVICE_NOT_FOUND",
  });
});
for (const action of ["logout", "all", "unbind", "switch"] as const)
  test(`in-flight binding cannot revive authorization after ${action}`, async (t) => {
    const f = await personalFixture();
    t.after(f.cleanup);
    const a = await f.connect();
    const authenticate = f.provider.authenticate;
    let release!: () => void, started!: () => void;
    const ready = new Promise<void>((resolve) => (started = resolve)),
      wait = new Promise<void>((resolve) => (release = resolve));
    f.provider.authenticate = async (...args) => {
      if (args[0].use((value) => value === "second")) {
        started();
        await wait;
      }
      return authenticate(...args);
    };
    const adding = f.sessions.bind(
      a.cookie,
      "sample",
      "second",
      undefined,
      signal(),
    );
    await ready;
    if (action === "unbind") await f.sessions.unbind(a.cookie, a.connection.id);
    else if (action === "switch")
      await f.sessions.switchConnection(a.cookie, a.connection.id, signal());
    else await f.sessions.remove(a.cookie, undefined, action === "all");
    release();
    await assert.rejects(
      adding,
      (e: unknown) =>
        e instanceof Error &&
        ["SESSION_CHANGED", "SESSION_REQUIRED"].includes(
          (e as { code?: string }).code ?? "",
        ),
    );
    const current = await f.sessions.get(a.cookie);
    assert.ok(!current.connections.some((c) => c.identity.subjectId === "2"));
  });
test("invalid and temporary provider failures preserve account, list and previous selection", async (t) => {
  const f = await personalFixture();
  t.after(f.cleanup);
  const a = await f.connect();
  const b = await f.connect(a.cookie, "second");
  const before = await f.sessions.get(a.cookie);
  for (const code of [
    "TOKEN_INVALID",
    "RATE_LIMITED",
    "PROVIDER_UNAVAILABLE",
  ]) {
    f.provider.authenticate = async () => {
      throw new ProviderError(
        code,
        "controlled",
        code === "TOKEN_INVALID" ? 401 : 503,
      );
    };
    await assert.rejects(
      f.sessions.switchConnection(a.cookie, a.connection.id, signal()),
      { code },
    );
    assert.deepEqual(await f.sessions.get(a.cookie), before);
  }
  assert.equal(b.session.authenticated, true);
});
test("account logout preserves bindings and stops only the appropriate delivery or account jobs", async (t) => {
  const f = await personalFixture();
  t.after(f.cleanup);
  const a = await f.connect(),
    b = await f.connect();
  const own = await f.sessions.lease(a.cookie, a.connection.id),
    shared = await f.sessions.workspaceLease(a.cookie, a.connection.id),
    otherDevice = await f.sessions.lease(b.cookie, a.connection.id);
  await f.sessions.remove(a.cookie);
  await assert.rejects(own.assertCurrent);
  await shared.assertCurrent();
  await otherDevice.assertCurrent();
  await f.sessions.remove(b.cookie, undefined, true);
  await assert.rejects(shared.assertCurrent);
  await assert.rejects(otherDevice.assertCurrent);
  const recovered = await f.sessions.login(
    "",
    a.session.account!.username,
    "test-password",
    signal(),
  );
  assert.equal(recovered.session.connections[0].id, a.connection.id);
  assert.equal(recovered.session.connected, false);
  for (const l of [own, shared, otherDevice]) l.release();
});
test("different Tokens for one platform identity remain separate and invalid data cannot cross account ownership", async (t) => {
  const f = await personalFixture();
  t.after(f.cleanup);
  const a = await f.connect(),
    b = await f.connect(a.cookie, "third");
  assert.equal(
    a.connection.identity.subjectId,
    b.connection.identity.subjectId,
  );
  assert.notEqual(a.connection.id, b.connection.id);
  const restarted = new PersonalSessions(
    f.sessions.root,
    f.registry,
    f.sessions.keyPath,
  );
  assert.equal((await restarted.get(a.cookie)).connections.length, 2);
});

for (const action of ["unbind", "logout", "all"] as const)
  test(`a delayed Token switch cannot restore selection after ${action}`, async (t) => {
    const f = await personalFixture();
    t.after(f.cleanup);
    const a = await f.connect();
    await f.connect(a.cookie, "second");
    const authenticate = f.provider.authenticate;
    let release!: () => void, started!: () => void;
    const waiting = new Promise<void>((resolve) => (release = resolve)),
      ready = new Promise<void>((resolve) => (started = resolve));
    f.provider.authenticate = async (...args) => {
      started();
      await waiting;
      return authenticate(...args);
    };
    const pending = f.sessions.switchConnection(
      a.cookie,
      a.connection.id,
      signal(),
    );
    await ready;
    if (action === "unbind") await f.sessions.unbind(a.cookie, a.connection.id);
    else await f.sessions.remove(a.cookie, undefined, action === "all");
    release();
    await assert.rejects(pending);
    const latest = await f.sessions.get(a.cookie);
    assert.notEqual(latest.workspace?.id, a.connection.id);
  });
