import test from "node:test";
import assert from "node:assert/strict";
import { personalFixture } from "./personal-fixture.ts";
import {
  repositoryPermissions,
  PERMISSION_CHECK_MS,
} from "../src/server/repository-permissions.ts";
import { repositoryKey, ProviderError } from "../src/server/providers/types.ts";

test("permissions coalesce across devices, expire without sliding, isolate tokens, and retry failed checks", async (t) => {
  const f = await personalFixture();
  t.after(f.cleanup);
  const checks = repositoryPermissions(f.sessions),
    repo = f.repositories[0],
    key = repositoryKey(repo);
  let now = Date.now(),
    calls = 0;
  checks.now = () => now;
  const original = f.provider.assertRead;
  f.provider.assertRead = async (...args) => {
    calls++;
    return original(...args);
  };
  const a = await f.connect(),
    b = await f.connect(),
    other = await f.connect("", "second");
  const leases = await Promise.all(
    [a, b, other].map((c) => f.sessions.lease(c.cookie, c.connection.id)),
  );
  t.after(() => leases.forEach((l) => l.release()));
  const check = (n = 0) =>
    checks.check([a, b, other][n].cookie, leases[n], key, repo);
  await Promise.all(Array.from({ length: 10 }, (_, n) => check(n % 2)));
  assert.equal(calls, 1);
  now += PERMISSION_CHECK_MS - 1;
  await check();
  assert.equal(calls, 1);
  now++;
  await Promise.all([check(), check(1)]);
  assert.equal(calls, 2);
  await check(2);
  assert.equal(calls, 3);
  now += PERMISSION_CHECK_MS;
  f.provider.assertRead = async () => {
    throw new ProviderError("PROVIDER_UNAVAILABLE", "offline");
  };
  await assert.rejects(check(), { code: "PROVIDER_UNAVAILABLE" });
  await assert.rejects(check(), { code: "PROVIDER_UNAVAILABLE" });
  f.provider.assertRead = original;
  assert.equal((await check()).repositoryId, repo.repositoryId);
  await f.sessions.remove(a.cookie);
  await assert.rejects(check());
  assert.equal((await check(1)).repositoryId, repo.repositoryId);
});

test("one device logout does not cancel another device's shared permission check", async (t) => {
  const f = await personalFixture();
  t.after(f.cleanup);
  const checks = repositoryPermissions(f.sessions),
    repo = f.repositories[0],
    key = repositoryKey(repo);
  const a = await f.connect(),
    b = await f.connect();
  const first = await f.sessions.lease(a.cookie, a.connection.id),
    second = await f.sessions.lease(b.cookie, b.connection.id);
  t.after(() => {
    first.release();
    second.release();
  });
  let enter!: () => void,
    release!: () => void,
    calls = 0;
  const started = new Promise<void>((r) => (enter = r)),
    gate = new Promise<void>((r) => (release = r));
  t.after(() => release());
  f.provider.assertRead = async (ctx) => {
    calls++;
    enter();
    await gate;
    ctx.signal.throwIfAborted();
  };
  const one = checks.check(a.cookie, first, key, repo);
  const rejected = assert.rejects(one);
  await started;
  const two = checks.check(b.cookie, second, key, repo);
  await f.sessions.remove(a.cookie);
  release();
  await rejected;
  assert.equal((await two).repositoryId, repo.repositoryId);
  assert.equal(calls, 1);
});

test("token denial invalidates all its repositories and an older successful response cannot restore them", async (t) => {
  const f = await personalFixture();
  t.after(f.cleanup);
  const checks = repositoryPermissions(f.sessions),
    c = await f.connect(),
    other = await f.connect("", "second");
  const lease = await f.sessions.lease(c.cookie, c.connection.id),
    otherLease = await f.sessions.lease(other.cookie, other.connection.id);
  t.after(() => {
    lease.release();
    otherLease.release();
  });
  const [one, two] = f.repositories;
  const check = (repo: typeof one, force = false) =>
    checks.check(c.cookie, lease, repositoryKey(repo), repo, { force });
  await Promise.all([
    check(one),
    check(two),
    checks.check(other.cookie, otherLease, repositoryKey(one), one),
  ]);
  let enter!: () => void, release!: () => void;
  const started = new Promise<void>((r) => (enter = r)),
    gate = new Promise<void>((r) => (release = r));
  t.after(() => release());
  const original = f.provider.assertRead;
  f.provider.assertRead = async (...args) => {
    await original(...args);
    if (args[1].repositoryId === one.repositoryId) {
      enter();
      await gate;
    }
  };
  const pending = check(one, true);
  const rejected = assert.rejects(pending, { code: "TOKEN_INVALID" });
  await started;
  f.controls.identityInvalid = true;
  await assert.rejects(check(two, true), { code: "TOKEN_INVALID" });
  release();
  await rejected;
  assert.throws(() => checks.assertAllowed(lease, repositoryKey(one)), {
    code: "TOKEN_INVALID",
  });
  assert.throws(() => checks.assertAllowed(lease, repositoryKey(two)), {
    code: "TOKEN_INVALID",
  });
  assert.doesNotThrow(() =>
    checks.assertAllowed(otherLease, repositoryKey(one)),
  );
  f.controls.identityInvalid = false;
  f.provider.assertRead = original;
  await check(one);
  assert.doesNotThrow(() => checks.assertAllowed(lease, repositoryKey(one)));
});
