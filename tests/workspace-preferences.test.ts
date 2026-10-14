import test from "node:test";
import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { personalFixture } from "./personal-fixture.ts";
import { preferencesResponse } from "../src/server/preferences-api.ts";
import { rotateWorkspaceKeys } from "../src/server/workspace-key-rotation.ts";
import { PersonalSessions } from "../src/server/personal-sessions.ts";
test("devices atomically merge changed preference fields and isolate other credentials", async (t) => {
  const f = await personalFixture();
  t.after(f.cleanup);
  const a = await f.connect(),
    b = await f.connect(),
    other = await f.connect("", "second");
  const r = f.repositories[0];
  const repository = {
    providerId: r.providerId,
    instanceId: r.instanceId,
    repositoryId: r.repositoryId,
    fullName: r.fullName,
  };
  await Promise.all([
    f.sessions.updatePreferences(a.cookie, { repository, module: "changes" }),
    f.sessions.updatePreferences(b.cookie, { railCollapsed: true }),
  ]);
  assert.deepEqual((await f.sessions.get(b.cookie)).workspace?.preferences, {
    repository,
    module: "changes",
    railCollapsed: true,
  });
  assert.deepEqual(
    (await f.sessions.get(other.cookie)).workspace?.preferences,
    {},
  );
  await assert.rejects(f.sessions.updatePreferences(a.cookie, { scroll: 4 }));
  await assert.rejects(
    f.sessions.updatePreferences(a.cookie, {
      repository: { ...repository, instanceId: "evil.test" },
    }),
  );
  const request = (
    body: unknown,
    origin = "https://folio.test",
    id = a.connection.id,
  ) =>
    new Request("https://folio.test/api/session/preferences", {
      method: "PATCH",
      headers: {
        origin,
        cookie: `openfolio-session=${a.cookie}`,
        "Content-Type": "application/json",
        "X-OpenFolio-Workspace": id,
        "X-OpenFolio-Revision": "1",
      },
      body: JSON.stringify(body),
    });
  assert.equal(
    (
      await preferencesResponse(
        request({ module: "specs" }, "https://evil.test"),
        f.sessions,
      )
    ).status,
    403,
  );
  assert.equal(
    (await preferencesResponse(request({ token: "first" }), f.sessions)).status,
    400,
  );
  assert.equal(
    (
      await preferencesResponse(
        request({ module: "specs" }, undefined, other.connection.id),
        f.sessions,
      )
    ).status,
    409,
  );
  await f.sessions.remove(a.cookie);
  assert.equal(
    (await preferencesResponse(request({ module: "specs" }), f.sessions))
      .status,
    401,
  );
  assert.deepEqual((await f.connect()).session.workspace?.preferences, {
    repository,
    module: "changes",
    railCollapsed: true,
  });
});
test("offline key rotation preserves UUIDs, devices and source bytes with new matching keys", async (t) => {
  const f = await personalFixture();
  t.after(f.cleanup);
  const a = await f.connect(),
    b = await f.connect("", "second");
  await f.sessions.updatePreferences(a.cookie, { railCollapsed: true });
  const source = join(f.root, "sessions"),
    target = join(f.root, "prepared");
  const original = await readFile(join(source, "state.json"));
  await rotateWorkspaceKeys(source, target, join(f.root, "key"));
  assert.deepEqual(await readFile(join(source, "state.json")), original);
  const rotated = new PersonalSessions(target, f.registry);
  assert.equal((await rotated.get(a.cookie)).workspace?.id, a.connection.id);
  assert.equal((await rotated.get(b.cookie)).workspace?.id, b.connection.id);
  const next = await rotated.login(
    "",
    "sample",
    "first",
    undefined,
    new AbortController().signal,
  );
  assert.equal(next.connection.id, a.connection.id);
  assert.equal(next.session.workspace?.preferences.railCollapsed, true);
  assert.notDeepEqual(
    await readFile(join(target, "credential-key")),
    await readFile(join(f.root, "key")),
  );
  assert.equal((await stat(join(target, "identity-key"))).mode & 0o777, 0o600);
  await assert.rejects(
    rotateWorkspaceKeys(source, target, join(f.root, "key")),
  );
  await assert.rejects(
    rotateWorkspaceKeys(
      source,
      join(f.root, "bad"),
      join(f.root, "missing-key"),
    ),
  );
  assert.deepEqual(await readFile(join(source, "state.json")), original);
});
