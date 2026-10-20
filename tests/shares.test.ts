import test from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { readFile, stat, writeFile } from "node:fs/promises";
import { repositoryFixture } from "./repositories-fixture.ts";
import { Shares } from "../src/server/shares.ts";
import {
  manageShareResponse,
  revokeShareResponse,
  sharedResponse,
} from "../src/server/share-api.ts";
import { DEFAULT_LIMITS, type Snapshot } from "../src/lib/model.ts";
import type { SharedChange } from "../src/lib/shared-change.ts";
import {
  repositoryPermissions,
  PERMISSION_CHECK_MS,
} from "../src/server/repository-permissions.ts";
import { SnapshotStore } from "../src/server/store.ts";
import { ThumbnailCache } from "../src/server/thumbnail-cache.ts";

async function setup() {
  const f = await repositoryFixture();
  for (const id of ["shared", "private"]) {
    await f.g.put(
      `docs/project/changes/${id}/change.json`,
      JSON.stringify({
        schemaVersion: 1,
        id,
        title: id,
        size: "small",
        status: "active",
        stage: "requirement",
        branch: "develop",
        confirmations: {},
        tasks: {},
        closure: {},
        previews: [
          {
            id: "screen",
            title: "Screen",
            kind: "page",
            devices: ["mobile"],
            artifact: {
              type: "git",
              path: "packages/prototype/preview/screen",
              sourceCommit: f.g.git(["rev-parse", "HEAD"]),
            },
          },
        ],
      }),
    );
    await f.g.put(
      `docs/project/changes/${id}/requirement.md`,
      `# ${id}\n\n${id} body`,
    );
    await f.g.put(
      `docs/project/changes/${id}/assets/image.png`,
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    );
  }
  await f.g.put(
    "packages/prototype/preview/screen/index.html",
    '<!doctype html><html><head><meta charset="utf-8"><title>Screen</title></head><body><h1>Shared prototype</h1></body></html>',
  );
  f.g.commit();
  const store = new Shares(join(f.f.root, "shares"));
  const manage = async (
    method = "POST",
    cookie = f.c.cookie,
    change = "shared",
    revision?: number,
  ) => {
    const session = await f.f.sessions.get(cookie);
    return manageShareResponse(
      new Request(
        `https://folio.test/api/repositories/${f.key}/changes/${change}/share?connectionId=${f.c.connection.id}`,
        {
          method,
          headers: {
            cookie: `openfolio-account=${cookie}`,
            origin: "https://folio.test",
            "x-openfolio-revision": String(revision ?? session.browserRevision),
          },
        },
      ),
      f.key,
      change,
      f.service,
      store,
      DEFAULT_LIMITS,
    );
  };
  const revoke = async (id: string, cookie = f.c.cookie) => {
    const session = await f.f.sessions.get(cookie);
    return revokeShareResponse(
      new Request(`https://folio.test/api/shares/${id}`, {
        method: "DELETE",
        headers: {
          cookie: `openfolio-account=${cookie}`,
          origin: "https://folio.test",
          "x-openfolio-revision": String(session.browserRevision),
        },
      }),
      id,
      f.service,
      store,
    );
  };
  const image = new ThumbnailCache(join(f.f.root, "thumbnails"), async () =>
    Buffer.from([255, 216, 255, 217]),
  );
  const read = (id: string, path = "change", method = "GET") =>
    sharedResponse(
      new Request(`https://folio.test/api/shares/${id}/${path}`, { method }),
      id,
      path.split("?")[0].split("/"),
      f.service,
      store,
      DEFAULT_LIMITS,
      image,
    );
  return {
    ...f,
    readPrivate: f.read,
    readSnapshot: () =>
      f.service.read(f.c.cookie, f.c.connection.id, f.key, (ctx) =>
        ctx.store.snapshot(ctx.project),
      ),
    store,
    manage,
    revoke,
    read,
  };
}

test("sharing persists, is idempotent and exposes only one Change; all resource kinds stay scoped", async (t) => {
  const f = await setup();
  t.after(f.cleanup);
  const responses = await Promise.all([f.manage(), f.manage()]);
  assert.deepEqual(
    responses.map((r) => r.status),
    [200, 200],
  );
  const a = (await responses[0].json()).share,
    b = (await responses[1].json()).share;
  assert.equal(a.id, b.id);
  assert.match(a.path, /^\/share\/[A-Za-z0-9_-]{43}$/);
  const persisted = new Shares(f.store.root);
  assert.equal((await persisted.get(a.id)).changeId, "shared");
  assert.equal(
    (await stat(join(f.store.root, "state.json"))).mode & 0o777,
    0o600,
  );
  assert.equal((await stat(f.store.root)).mode & 0o777, 0o700);
  const response = await f.read(a.id);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const data = (await response.json()) as SharedChange;
  assert.equal(data.change.id, "shared");
  assert.ok(data.documents.every((d) => d.path.includes("/shared/")));
  assert.deepEqual(Object.keys(data).sort(), [
    "capturedAt",
    "change",
    "documents",
    "projectName",
    "snapshotId",
  ]);
  assert.ok(!JSON.stringify(data).includes("uploadUrl"));
  const document = data.documents.find((d) => d.kind === "markdown")!;
  assert.match(
    (
      await (
        await f.read(
          a.id,
          `documents/${document.id}?snapshot=${data.snapshotId}`,
        )
      ).json()
    ).body,
    /shared body/,
  );
  const asset = data.documents.find((d) => d.kind === "image")!;
  assert.equal(
    (await f.read(a.id, `assets/${asset.id}?snapshot=${data.snapshotId}`))
      .status,
    200,
  );
  const snapshot = await f.readSnapshot();
  for (const doc of snapshot.documents.filter(
    (d) => !data.documents.some((s) => s.id === d.id),
  ))
    assert.equal(
      (await f.read(a.id, `documents/${doc.id}?snapshot=${data.snapshotId}`))
        .status,
      404,
    );
  for (const key of ["revision", "branch", "path", "head", "base", "change"])
    assert.equal((await f.read(a.id, `change?${key}=private`)).status, 400);
  assert.equal(
    (await f.read(a.id, `documents/${document.id}?snapshot=old`)).status,
    409,
  );
  assert.equal(
    (await f.read(a.id, `integration?snapshot=${data.snapshotId}`)).status,
    200,
  );
  const preview = await (
    await f.read(a.id, `previews?snapshot=${data.snapshotId}`)
  ).json();
  assert.equal(preview.entries[0].available, true, JSON.stringify(preview));
  assert.match(
    preview.entries[0].url,
    new RegExp(`/api/shares/${a.id}/previews/screen/index.html`),
  );
  for (const name of ["index.html", "mobile.jpg"]) {
    const assetResponse = await f.read(
      a.id,
      `previews/screen/${name}?snapshot=${data.snapshotId}`,
    );
    assert.equal(assetResponse.status, 200);
    assert.equal(assetResponse.headers.get("cache-control"), "no-store");
    assert.equal(
      (
        await f.read(
          a.id,
          `previews/screen/${name}?snapshot=${data.snapshotId}`,
          "HEAD",
        )
      ).status,
      200,
    );
  }
  assert.equal((await f.read(a.id, "change", "POST")).status, 405);
  const head = await f.read(a.id, "change", "HEAD");
  assert.equal(await head.text(), "");
  assert.equal((await f.revoke(a.id)).status, 200);
  for (const path of [
    "change",
    `documents/${document.id}?snapshot=${data.snapshotId}`,
    `assets/${asset.id}?snapshot=${data.snapshotId}`,
    `integration?snapshot=${data.snapshotId}`,
    `previews/screen/index.html?snapshot=${data.snapshotId}`,
    `previews/screen/mobile.jpg?snapshot=${data.snapshotId}`,
  ]) {
    assert.equal((await f.read(a.id, path)).status, 410);
    assert.equal((await f.read(a.id, path, "HEAD")).status, 410);
  }
  assert.equal((await f.revoke(a.id)).status, 200);
  const replacement = (await (await f.manage()).json()).share;
  assert.notEqual(replacement.id, a.id);
  assert.equal((await f.read(a.id)).status, 410);
});

test("owner isolation, device logout independence, live updates and binding removal", async (t) => {
  const f = await setup();
  t.after(f.cleanup);
  const a = (await (await f.manage()).json()).share;
  const other = await f.f.connect("", "second");
  assert.equal((await f.revoke(a.id, other.cookie)).status, 404);
  assert.equal((await f.manage("POST", other.cookie)).status, 401);
  assert.equal((await f.manage("POST", f.c.cookie, "shared", 999)).status, 409);
  const before = (await (await f.read(a.id)).json()) as SharedChange;
  await f.g.put(
    "docs/project/changes/shared/requirement.md",
    "# 最新内容\n\nnew body",
  );
  f.g.commit();
  await f.readPrivate((ctx) => ctx.refresh(DEFAULT_LIMITS));
  const after = (await (await f.read(a.id)).json()) as SharedChange;
  assert.notEqual(after.snapshotId, before.snapshotId);
  assert.equal(
    (
      await f.read(
        a.id,
        `documents/${before.documents[0].id}?snapshot=${before.snapshotId}`,
      )
    ).status,
    409,
  );
  await f.f.sessions.remove(f.c.cookie);
  assert.equal((await f.read(a.id)).status, 200);
  const again = await f.f.connect("", "first");
  await f.f.sessions.unbind(again.cookie, again.connection.id);
  assert.equal((await f.read(a.id)).status, 403);
  assert.equal((await f.revoke(a.id, again.cookie)).status, 200);
});

test("fixed permission TTL, explicit denial and revoke during an in-flight document read", async (t) => {
  const f = await setup();
  t.after(f.cleanup);
  const a = (await (await f.manage()).json()).share;
  const b = (await (await f.manage("POST", f.c.cookie, "private")).json())
    .share;
  const data = (await (await f.read(a.id)).json()) as SharedChange;
  const doc = data.documents.find((d) => d.kind === "markdown")!;
  let release!: () => void, started!: () => void;
  const gate = new Promise<void>((r) => (release = r)),
    begun = new Promise<void>((r) => (started = r));
  const original = SnapshotStore.prototype.document;
  const mock = t.mock.method(
    SnapshotStore.prototype,
    "document",
    async function (this: SnapshotStore, ...args: Parameters<typeof original>) {
      const result = await original.apply(this, args);
      started();
      await gate;
      return result;
    },
  );
  const inFlight = f.read(
    a.id,
    `documents/${doc.id}?snapshot=${data.snapshotId}`,
  );
  await begun;
  await f.revoke(a.id);
  release();
  assert.equal((await inFlight).status, 410);
  mock.mock.restore();
  assert.equal((await f.read(b.id)).status, 200);
  const checks = repositoryPermissions(f.f.sessions),
    now = Date.now();
  checks.now = () => now + PERMISSION_CHECK_MS + 1;
  f.f.controls.deny.add(f.repo.repositoryId);
  assert.equal((await f.read(b.id)).status, 403);
  assert.equal((await f.revoke(b.id)).status, 200);
});

test("malformed storage is not overwritten and an invalidated create cannot return a link", async (t) => {
  const f = await setup();
  t.after(f.cleanup);
  const create = f.store.create.bind(f.store);
  t.mock.method(
    f.store,
    "create",
    async (...args: Parameters<typeof create>) => {
      const result = await create(...args);
      await f.f.sessions.remove(f.c.cookie);
      return result;
    },
  );
  assert.equal((await f.manage()).status, 401);
  const file = join(f.store.root, "state.json");
  const saved = JSON.parse(await readFile(file, "utf8"));
  assert.ok(saved.records[0].revokedAt);
  await writeFile(file, "{broken");
  await assert.rejects(f.store.get(saved.records[0].id), {
    code: "SHARE_DATA_INVALID",
  });
  assert.equal(await readFile(file, "utf8"), "{broken");
});

test("one refresh serves private and public readers; revoking one link does not cancel the job", async (t) => {
  const f = await setup();
  t.after(f.cleanup);
  const a = (await (await f.manage()).json()).share;
  const b = (await (await f.manage("POST", f.c.cookie, "private")).json())
    .share;
  let release!: () => void, started!: () => void;
  const gate = new Promise<void>((r) => (release = r)),
    begun = new Promise<void>((r) => (started = r));
  const original = SnapshotStore.prototype.refresh;
  const mock = t.mock.method(
    SnapshotStore.prototype,
    "refresh",
    async function (this: SnapshotStore, ...args: Parameters<typeof original>) {
      started();
      await gate;
      return original.apply(this, args);
    },
  );
  const first = f.read(a.id);
  await begun;
  const second = f.read(b.id);
  const privateRead = f.readPrivate((ctx) => ctx.refresh(DEFAULT_LIMITS, true));
  await f.revoke(a.id);
  release();
  assert.equal((await first).status, 410);
  assert.equal((await second).status, 200);
  await privateRead;
  assert.equal(mock.mock.callCount(), 1);
});

for (const interruption of ["snapshot", "unbind"] as const) {
  test(`${interruption} changes while reading a document prevent stale delivery`, async (t) => {
    const f = await setup();
    t.after(f.cleanup);
    const share = (await (await f.manage()).json()).share;
    const data = (await (await f.read(share.id)).json()) as SharedChange;
    const doc = data.documents.find((d) => d.kind === "markdown")!;
    let release!: () => void, started!: () => void;
    const gate = new Promise<void>((r) => (release = r)),
      begun = new Promise<void>((r) => (started = r));
    const original = SnapshotStore.prototype.document;
    t.mock.method(
      SnapshotStore.prototype,
      "document",
      async function (
        this: SnapshotStore,
        ...args: Parameters<typeof original>
      ) {
        const value = await original.apply(this, args);
        started();
        await gate;
        return value;
      },
    );
    const pending = f.read(
      share.id,
      `documents/${doc.id}?snapshot=${data.snapshotId}`,
    );
    await begun;
    if (interruption === "snapshot") {
      await f.g.put(
        "docs/project/changes/shared/requirement.md",
        "# Updated during read",
      );
      f.g.commit();
      await f.readPrivate((ctx) => ctx.refresh(DEFAULT_LIMITS));
    } else await f.f.sessions.unbind(f.c.cookie, f.c.connection.id);
    release();
    const response = await pending;
    assert.equal(response.status, interruption === "snapshot" ? 409 : 403);
    assert.doesNotMatch(await response.text(), /shared body/);
  });
}
