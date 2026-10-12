import test from "node:test";
import assert from "node:assert/strict";
import { createCipheriv, randomBytes, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile, stat, unlink, cp } from "node:fs/promises";
import { join } from "node:path";
import { repositoryFixture } from "./repositories-fixture.ts";
import {
  PersonalSessions,
  cookieHash,
} from "../src/server/personal-sessions.ts";
import {
  migratePersonalV1,
  legacyStateSchema,
  type LegacyState,
} from "../src/server/workspace-migration.ts";
import {
  sessionResponse,
  restoreSessionResponse,
} from "../src/server/connection-api.ts";
import { Discovery } from "../src/server/discovery.ts";
import { Repositories } from "../src/server/repositories.ts";
import { SnapshotStore } from "../src/server/store.ts";
import { GitReader } from "../src/server/git.ts";
import { DEFAULT_LIMITS } from "../src/lib/model.ts";
const request = (cookie: string, body?: unknown) =>
  new Request("https://folio.test/api/session/restore", {
    method: body === undefined ? "GET" : "POST",
    headers: {
      origin: "https://folio.test",
      "content-type": "application/json",
      cookie: `openfolio-session=${cookie}`,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
async function setup(
  groups: string[][] = [["first", "first", "third"], ["first"]],
) {
  const t = await repositoryFixture(),
    root = join(t.f.root, "upgrade"),
    legacy = join(root, "personal-v1"),
    next = join(root, "personal-v2"),
    key = randomBytes(32);
  await mkdir(legacy, { recursive: true, mode: 0o700 });
  await mkdir(next, { recursive: true, mode: 0o700 });
  await writeFile(join(legacy, "credential-key"), key, { mode: 0o600 });
  const entries: {
    cookie: string;
    session: LegacyState["sessions"][number];
  }[] = [];
  for (const tokens of groups) {
    const id = randomUUID(),
      cookie = randomBytes(32).toString("base64url"),
      connections = [];
    for (const token of tokens) {
      const cid = randomUUID(),
        revision = 2,
        nonce = randomBytes(12),
        cipher = createCipheriv("aes-256-gcm", key, nonce);
      cipher.setAAD(Buffer.from(JSON.stringify([1, id, cid, revision])));
      const ciphertext = Buffer.concat([
        cipher.update(token, "utf8"),
        cipher.final(),
      ]);
      connections.push({
        id: cid,
        revision,
        identity: {
          providerId: "sample",
          instanceId: "sample.test",
          subjectId: "1",
          login: "reader",
          displayName: "Reader",
        },
        label: token === "third" ? "Other token" : "Old token",
        nonce: nonce.toString("base64url"),
        ciphertext: ciphertext.toString("base64url"),
        tag: cipher.getAuthTag().toString("base64url"),
      });
    }
    entries.push({
      cookie,
      session: {
        id,
        cookieHash: cookieHash(cookie),
        expiresAt: Date.now() + 24 * 60 * 60 * 1000,
        connections,
      },
    });
  }
  const old = { schemaVersion: 1, sessions: entries.map((e) => e.session) };
  await writeFile(join(legacy, "sessions.json"), JSON.stringify(old), {
    mode: 0o600,
  });
  const store = new PersonalSessions(
    next,
    t.f.registry,
    join(next, "credential-key"),
  );
  const addCache = async (
    group: number,
    index: number,
    date: number = Date.now(),
  ) => {
    const session = entries[group].session,
      c = session.connections[index],
      dir = join(root, "repositories-v1", session.id, c.id, String(c.revision)),
      project = {
        id: t.key,
        name: t.repo.fullName,
        repositoryUrl: t.repo.cloneUrl,
      },
      cached = new SnapshotStore(
        dir,
        (where) => new GitReader(where, t.g.remote, "file"),
      ),
      snap = await cached.refresh(project, DEFAULT_LIMITS),
      path = join(cached.directory(project), "snapshots", `${snap.id}.json`);
    await writeFile(
      path,
      JSON.stringify({ ...snap, capturedAt: new Date(date).toISOString() }),
    );
    const discoveryPath = join(root, "discovery-v1", session.id, c.id);
    await mkdir(discoveryPath, { recursive: true });
    await writeFile(
      join(discoveryPath, `${c.revision}.json`),
      JSON.stringify({
        revision: c.revision,
        state: "complete",
        cursor: null,
        pending: [],
        started: true,
        results: [
          {
            key: t.key,
            repository: t.repo,
            state: "ready",
            specBranch: "trunk",
          },
        ],
        updatedAt: new Date(date).toISOString(),
      }),
    );
    return { id: snap.id, dir: cached.directory(project) };
  };
  return { ...t, root, legacy, next, store, entries, old, addCache };
}

test("migration groups exact tokens, chooses latest complete cache and preserves all old bytes", async () => {
  const t = await setup();
  try {
    const older = await t.addCache(0, 0, Date.now() - 2000),
      latest = await t.addCache(0, 1, Date.now() - 1000),
      other = await t.addCache(0, 2, Date.now() - 500);
    const original = await readFile(join(t.legacy, "sessions.json")),
      oldPointer = await readFile(join(older.dir, "current"));
    const current = await t.store.get(t.entries[0].cookie);
    assert.equal(current.connected, false);
    assert.equal(current.legacyChoices?.length, 3);
    const state = JSON.parse(
      await readFile(join(t.next, "state.json"), "utf8"),
    );
    assert.equal(state.workspaces.length, 2);
    assert.equal(state.workspaces[0].legacyConnectionIds.length, 3);
    assert.equal(state.sessions.length, 0);
    assert.deepEqual(await readFile(join(t.legacy, "sessions.json")), original);
    assert.deepEqual(await readFile(join(older.dir, "current")), oldPointer);
    const a = await t.store.login(
        "",
        "sample",
        "first",
        "reader",
        undefined,
        new AbortController().signal,
      ),
      b = await t.store.login(
        "",
        "sample",
        "third",
        "reader",
        undefined,
        new AbortController().signal,
      );
    const discovery = new Discovery(
        join(t.root, "discovery-v2"),
        t.store,
        t.f.git,
      ),
      repos = new Repositories(
        join(t.root, "repositories-v2"),
        t.store,
        discovery,
        t.f.git,
        (dir) => new GitReader(dir, t.g.remote, "file"),
      );
    const snapshot = async (cookie: string, id: string) =>
      repos.read(cookie, id, t.key, async (ctx) =>
        ctx.store.workbench(ctx.project),
      );
    assert.equal((await snapshot(a.cookie, a.connection.id)).id, latest.id);
    assert.equal((await snapshot(b.cookie, b.connection.id)).id, other.id);
    await assert.rejects(
      () =>
        repos.read(b.cookie, b.connection.id, t.key, async (ctx) =>
          ctx.store.workbench(ctx.project, latest.id),
        ),
      { code: "SNAPSHOT_EXPIRED" },
    );
    assert.equal(
      (
        await t.store.login(
          "",
          "sample",
          "first",
          "reader",
          undefined,
          new AbortController().signal,
        )
      ).connection.id,
      a.connection.id,
    );
    t.f.controls.deny.add("1");
    await assert.rejects(() => snapshot(a.cookie, a.connection.id), {
      code: "READ_DENIED",
    });
  } finally {
    await t.cleanup();
  }
});

test("one old connection automatically restores its device; multi-choice restore is owned, revalidated and one-use", async () => {
  const t = await setup([["first"], ["first", "third"]]);
  try {
    const response = await sessionResponse(
      request(t.entries[0].cookie),
      t.store,
    );
    assert.equal(response.status, 200);
    const body = await response.json(),
      cookie = response.headers.get("set-cookie")!.split(";")[0].split("=")[1];
    assert.equal(body.connected, true);
    assert.ok(!JSON.stringify(body).includes("replacementCookie"));
    assert.notEqual(cookie, t.entries[0].cookie);
    const lease = await t.store.lease(
      cookie,
      t.entries[0].session.connections[0].id,
    );
    lease.release();
    assert.equal((await t.store.get(t.entries[0].cookie)).connected, false);
    const legacyCookie = t.entries[1].cookie,
      choices = await t.store.get(legacyCookie);
    assert.equal(choices.legacyChoices?.length, 2);
    const id = choices.legacyChoices![0].id;
    assert.equal(
      (
        await restoreSessionResponse(
          request(legacyCookie, {
            connectionId: t.entries[0].session.connections[0].id,
          }),
          t.store,
        )
      ).status,
      401,
    );
    assert.equal(
      (await restoreSessionResponse(request("", { connectionId: id }), t.store))
        .status,
      401,
    );
    t.f.controls.identityInvalid = true;
    assert.equal(
      (
        await restoreSessionResponse(
          request(legacyCookie, { connectionId: id }),
          t.store,
        )
      ).status,
      401,
    );
    t.f.controls.identityInvalid = false;
    assert.equal((await t.store.get(legacyCookie)).legacyChoices?.length, 2);
    const result = await Promise.all([
      restoreSessionResponse(
        request(legacyCookie, { connectionId: id }),
        t.store,
      ),
      restoreSessionResponse(
        request(legacyCookie, { connectionId: id }),
        t.store,
      ),
    ]);
    assert.deepEqual(result.map((r) => r.status).sort(), [200, 401]);
    assert.equal((await t.store.get(legacyCookie)).connected, false);
    assert.equal((await t.store.get(cookie)).connected, true);
  } finally {
    await t.cleanup();
  }
});

test("missing old keys and bad ciphertext stop migration before publishing or replacing data", async () => {
  const t = await setup();
  try {
    const path = join(t.legacy, "sessions.json"),
      raw = await readFile(path),
      keyPath = join(t.legacy, "credential-key"),
      key = await readFile(keyPath);
    await unlink(keyPath);
    await assert.rejects(() => t.store.get(""), {
      code: "CREDENTIAL_KEY_UNAVAILABLE",
    });
    assert.deepEqual(await readFile(path), raw);
    await assert.rejects(() => stat(join(t.next, "state.json")));
    await assert.rejects(() => stat(join(t.next, "identity-key")));
    await writeFile(keyPath, key, { mode: 0o600 });
    const malformed = JSON.parse(raw.toString());
    malformed.sessions[0].connections[0].ciphertext = "wrong";
    await writeFile(path, JSON.stringify(malformed));
    await assert.rejects(() => t.store.get(""), {
      code: "CREDENTIAL_UNREADABLE",
    });
    await assert.rejects(() => stat(join(t.next, "identity-key")));
  } finally {
    await t.cleanup();
  }
});

test("interrupted directory publication is repeatable with stable workspace ids; v1 remains usable for rollback", async () => {
  const t = await setup();
  try {
    const cache = await t.addCache(0, 0),
      original = await readFile(join(t.legacy, "sessions.json"));
    await assert.rejects(
      () =>
        migratePersonalV1(
          t.next,
          t.store.keyPath,
          t.store.identityKeyPath,
          (phase) => {
            if (phase === "repositories-v2") throw Error("fixture crash");
          },
        ),
      { code: "MIGRATION_FAILED" },
    );
    await assert.rejects(() => stat(join(t.next, "state.json")));
    const pending = JSON.parse(
      await readFile(join(t.next, "migration.json"), "utf8"),
    );
    await t.store.get("");
    const state = JSON.parse(
      await readFile(join(t.next, "state.json"), "utf8"),
    );
    assert.deepEqual(
      state.workspaces.map((w: { id: string }) => w.id),
      pending.state.workspaces.map((w: { id: string }) => w.id),
    );
    assert.equal(
      await migratePersonalV1(t.next, t.store.keyPath, t.store.identityKeyPath),
      false,
    );
    assert.deepEqual(await readFile(join(t.legacy, "sessions.json")), original);
    legacyStateSchema.parse(JSON.parse(original.toString()));
    assert.equal(
      (await readFile(join(cache.dir, "current"), "utf8")).trim(),
      cache.id,
    );
    assert.equal((await stat(t.store.keyPath)).mode & 0o777, 0o600);
  } finally {
    await t.cleanup();
  }
});

test("unknown revisions and incomplete caches stay in backup; changed migration source refuses continuation", async () => {
  const t = await setup();
  try {
    const incomplete = await t.addCache(0, 0);
    const oldRevision = join(
      incomplete.dir,
      "..",
      "..",
      "1",
      incomplete.dir.split("/").at(-1)!,
    );
    await cp(incomplete.dir, oldRevision, { recursive: true });
    await writeFile(join(incomplete.dir, "current"), randomUUID());
    await assert.rejects(
      () =>
        migratePersonalV1(
          t.next,
          t.store.keyPath,
          t.store.identityKeyPath,
          (phase) => {
            if (phase === "manifest") throw Error("fixture crash");
          },
        ),
      { code: "MIGRATION_FAILED" },
    );
    const path = join(t.legacy, "sessions.json"),
      source = await readFile(path, "utf8");
    await writeFile(path, source + " ");
    await assert.rejects(() => t.store.get(""), {
      code: "MIGRATION_SOURCE_CHANGED",
    });
    await writeFile(path, source);
    await t.store.get("");
    const a = await t.store.login(
      "",
      "sample",
      "first",
      "reader",
      undefined,
      new AbortController().signal,
    );
    await assert.rejects(() =>
      stat(join(t.root, "repositories-v2", a.connection.id, t.key, "current")),
    );
    assert.ok(await stat(incomplete.dir));
  } finally {
    await t.cleanup();
  }
});

test("missing migration identity key fails closed; identical tokens on old instances stay separate", async () => {
  const t = await setup([["first"], ["first"]]);
  try {
    const path = join(t.legacy, "sessions.json"),
      raw = JSON.parse(await readFile(path, "utf8"));
    raw.sessions[1].connections[0].identity.instanceId = "other.test";
    await writeFile(path, JSON.stringify(raw));
    await assert.rejects(
      () =>
        migratePersonalV1(
          t.next,
          t.store.keyPath,
          t.store.identityKeyPath,
          (phase) => {
            if (phase === "manifest") throw Error("fixture crash");
          },
        ),
      { code: "MIGRATION_FAILED" },
    );
    const identityKey = await readFile(t.store.identityKeyPath);
    await unlink(t.store.identityKeyPath);
    await assert.rejects(() => t.store.get(""), {
      code: "CREDENTIAL_KEY_UNAVAILABLE",
    });
    await assert.rejects(() => stat(t.store.identityKeyPath));
    await writeFile(t.store.identityKeyPath, identityKey, { mode: 0o600 });
    await t.store.get("");
    const state = JSON.parse(
      await readFile(join(t.next, "state.json"), "utf8"),
    );
    assert.equal(state.workspaces.length, 2);
    assert.notEqual(state.workspaces[0].id, state.workspaces[1].id);
  } finally {
    await t.cleanup();
  }
});
